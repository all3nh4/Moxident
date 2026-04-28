// tests/search-volume-handler.test.mjs
//
// Tests for GET /search-volume route and getSearchVolume() in db.mjs.

import { jest } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient:      jest.fn(() => ({ send: mockSend })),
  PutItemCommand:      jest.fn(input => ({ type: 'PutItemCommand', input })),
  GetItemCommand:      jest.fn(input => ({ type: 'GetItemCommand', input })),
  ScanCommand:         jest.fn(input => ({ type: 'ScanCommand', input })),
  UpdateItemCommand:   jest.fn(input => ({ type: 'UpdateItemCommand', input })),
  BatchGetItemCommand: jest.fn(input => ({ type: 'BatchGetItemCommand', input })),
}));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient:        jest.fn(() => ({ send: mockSend })),
  SendEmailCommand: jest.fn(input => ({ type: 'SendEmailCommand', input })),
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-sv'),
}));

jest.unstable_mockModule('../src/router.mjs', () => ({
  submitRequest:        jest.fn(),
  handleDentistReply:   jest.fn(),
  routeVerifiedPatient: jest.fn(),
}));

// ── Import after ALL mocks ───────────────────────────────────────────────────

const { getSearchVolume } = await import('../src/db.mjs');
const { handler }         = await import('../src/handler.mjs');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(method, path, queryParams = {}) {
  const qs = new URLSearchParams(queryParams).toString();
  return {
    rawPath: `/prod${path}`,
    rawQueryString: qs,
    queryStringParameters: Object.keys(queryParams).length ? queryParams : undefined,
    requestContext: { http: { method } },
    body: '{}',
  };
}

function makeSearchVolumeItem(zip, city, monthlySearches, adjacentZips) {
  return {
    Item: {
      zipCode:         { S: zip },
      city:            { S: city },
      monthlySearches: { N: String(monthlySearches) },
      adjacentZips:    { SS: adjacentZips },
      lastUpdated:     { S: '2026-03-29T06:00:00.000Z' },
    },
  };
}

// ── getSearchVolume unit tests ───────────────────────────────────────────────

describe('getSearchVolume', () => {
  afterEach(() => jest.clearAllMocks());

  test('returns monthlySearches when primary zip is found with volume > 0', async () => {
    mockSend.mockResolvedValueOnce(
      makeSearchVolumeItem('98033', 'Kirkland', 120, ['98034', '98011', '98028'])
    );

    const result = await getSearchVolume('98033');

    expect(result.monthlySearches).toBe(120);
    expect(result.city).toBe('Kirkland');
    expect(result.isAggregated).toBe(false);
  });

  test('falls back to adjacent zips when primary zip has 0 volume', async () => {
    // Primary zip returns 0
    mockSend.mockResolvedValueOnce(
      makeSearchVolumeItem('98033', 'Kirkland', 0, ['98034', '98011', '98028'])
    );

    // BatchGetItem for adjacent zips
    mockSend.mockResolvedValueOnce({
      Responses: {
        'moxident-search-volume': [
          { zipCode: { S: '98034' }, monthlySearches: { N: '50' } },
          { zipCode: { S: '98011' }, monthlySearches: { N: '30' } },
          { zipCode: { S: '98028' }, monthlySearches: { N: '20' } },
        ],
      },
    });

    const result = await getSearchVolume('98033');

    expect(result.monthlySearches).toBe(100);
    expect(result.city).toBe('Kirkland');
    expect(result.isAggregated).toBe(true);
  });

  test('returns null when primary and all adjacent zips are empty', async () => {
    // Primary zip not in DB
    mockSend.mockResolvedValueOnce({ Item: undefined });

    // BatchGetItem returns items with 0 volume
    mockSend.mockResolvedValueOnce({
      Responses: {
        'moxident-search-volume': [
          { zipCode: { S: '98034' }, monthlySearches: { N: '0' } },
          { zipCode: { S: '98011' }, monthlySearches: { N: '0' } },
          { zipCode: { S: '98028' }, monthlySearches: { N: '0' } },
        ],
      },
    });

    const result = await getSearchVolume('98033');

    expect(result.monthlySearches).toBeNull();
    expect(result.city).toBe('Kirkland');
    expect(result.isAggregated).toBe(false);
  });

  test('returns null when zip is not in DB and not a known city zip', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });

    const result = await getSearchVolume('99999');

    expect(result.monthlySearches).toBeNull();
    expect(result.isAggregated).toBe(false);
  });

  test('aggregates correctly when primary zip not in DB but is a known city', async () => {
    // Primary zip not in DB (no Item)
    mockSend.mockResolvedValueOnce({ Item: undefined });

    // Adjacent zips have volume
    mockSend.mockResolvedValueOnce({
      Responses: {
        'moxident-search-volume': [
          { zipCode: { S: '98005' }, monthlySearches: { N: '80' } },
          { zipCode: { S: '98006' }, monthlySearches: { N: '60' } },
          { zipCode: { S: '98007' }, monthlySearches: { N: '40' } },
          { zipCode: { S: '98008' }, monthlySearches: { N: '20' } },
        ],
      },
    });

    const result = await getSearchVolume('98004');

    expect(result.monthlySearches).toBe(200);
    expect(result.city).toBe('Bellevue');
    expect(result.isAggregated).toBe(true);
  });

  test('finds city entry when zip is an adjacent zip (not primary)', async () => {
    // Zip 98034 is an adjacent of Kirkland (primary 98033)
    mockSend.mockResolvedValueOnce({ Item: undefined });

    // BatchGetItem for Kirkland's adjacent zips
    mockSend.mockResolvedValueOnce({
      Responses: {
        'moxident-search-volume': [
          { zipCode: { S: '98034' }, monthlySearches: { N: '45' } },
          { zipCode: { S: '98011' }, monthlySearches: { N: '35' } },
          { zipCode: { S: '98028' }, monthlySearches: { N: '25' } },
        ],
      },
    });

    const result = await getSearchVolume('98034');

    expect(result.monthlySearches).toBe(105);
    expect(result.isAggregated).toBe(true);
  });

  test('handles BatchGetItem returning empty responses', async () => {
    mockSend.mockResolvedValueOnce(
      makeSearchVolumeItem('98033', 'Kirkland', 0, ['98034', '98011', '98028'])
    );

    mockSend.mockResolvedValueOnce({
      Responses: { 'moxident-search-volume': [] },
    });

    const result = await getSearchVolume('98033');

    expect(result.monthlySearches).toBeNull();
    expect(result.city).toBe('Kirkland');
    expect(result.isAggregated).toBe(false);
  });
});

// ── GET /search-volume handler tests ─────────────────────────────────────────

describe('GET /search-volume', () => {
  afterEach(() => jest.clearAllMocks());

  test('returns 400 for invalid zip (not 5 digits)', async () => {
    const event = makeEvent('GET', '/search-volume', { zip: '123' });
    const res = await handler(event);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/Invalid zip/);
  });

  test('returns 400 for missing zip', async () => {
    const event = makeEvent('GET', '/search-volume', {});
    const res = await handler(event);

    expect(res.statusCode).toBe(400);
  });

  test('returns 400 for non-numeric zip', async () => {
    const event = makeEvent('GET', '/search-volume', { zip: 'abcde' });
    const res = await handler(event);

    expect(res.statusCode).toBe(400);
  });

  test('returns 200 with search volume data for valid zip', async () => {
    mockSend.mockResolvedValueOnce(
      makeSearchVolumeItem('98033', 'Kirkland', 150, ['98034', '98011', '98028'])
    );

    const event = makeEvent('GET', '/search-volume', { zip: '98033' });
    const res = await handler(event);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.zip).toBe('98033');
    expect(body.monthlySearches).toBe(150);
    expect(body.isAggregated).toBe(false);
    expect(body.city).toBe('Kirkland');
  });

  test('returns 200 with null monthlySearches when zip not in DB', async () => {
    // GetItem returns empty
    mockSend.mockResolvedValueOnce({ Item: undefined });

    const event = makeEvent('GET', '/search-volume', { zip: '99999' });
    const res = await handler(event);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.zip).toBe('99999');
    expect(body.monthlySearches).toBeNull();
  });

  test('returns aggregated data when primary is 0 but adjacent zips have volume', async () => {
    mockSend.mockResolvedValueOnce(
      makeSearchVolumeItem('98033', 'Kirkland', 0, ['98034', '98011', '98028'])
    );

    mockSend.mockResolvedValueOnce({
      Responses: {
        'moxident-search-volume': [
          { zipCode: { S: '98034' }, monthlySearches: { N: '70' } },
          { zipCode: { S: '98011' }, monthlySearches: { N: '30' } },
        ],
      },
    });

    const event = makeEvent('GET', '/search-volume', { zip: '98033' });
    const res = await handler(event);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.monthlySearches).toBe(100);
    expect(body.isAggregated).toBe(true);
    expect(body.city).toBe('Kirkland');
  });

  test('returns 500 when DynamoDB throws', async () => {
    mockSend.mockRejectedValueOnce(new Error('DynamoDB unavailable'));

    const event = makeEvent('GET', '/search-volume', { zip: '98033' });
    const res = await handler(event);

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBeTruthy();
  });

  test('existing routes still work after adding search-volume', async () => {
    mockSend.mockResolvedValue({ Items: [] });

    const health = await handler(makeEvent('GET', '/health'));
    expect(health.statusCode).toBe(200);
    expect(JSON.parse(health.body).status).toBe('ok');

    const notFound = await handler(makeEvent('GET', '/nonexistent'));
    expect(notFound.statusCode).toBe(404);
  });
});
