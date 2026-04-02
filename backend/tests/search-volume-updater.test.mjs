// tests/search-volume-updater.test.mjs
//
// Tests for the moxident-search-volume-updater Lambda.
// Mocks: DynamoDB only (no external API calls, no CloudWatch).

import { jest } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDbSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockDbSend })),
  PutItemCommand: jest.fn(input => ({ type: 'PutItemCommand', input })),
}));

const { handler } = await import('../src/search-volume-updater.mjs');
const { CITIES }  = await import('../src/cities.mjs');

// ── Tests ────────────────────────────────────────────────────────────────────

describe('search-volume-updater Lambda', () => {
  beforeEach(() => {
    mockDbSend.mockResolvedValue({});
  });

  afterEach(() => jest.clearAllMocks());

  test('writes all 30 cities to DynamoDB', async () => {
    const result = await handler({});
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.successCount).toBe(30);
    expect(body.failureCount).toBe(0);

    // 30 DynamoDB PutItem calls (one per city)
    expect(mockDbSend).toHaveBeenCalledTimes(30);
  });

  test('writes correct DynamoDB item shape for first city', async () => {
    await handler({});

    const firstPut = mockDbSend.mock.calls[0][0];
    const item = firstPut.input.Item;

    expect(item.zipCode.S).toBe('98033'); // Kirkland is first
    expect(item.city.S).toBe('Kirkland');
    expect(item.monthlySearches.N).toBe('110');
    expect(item.adjacentZips.SS).toEqual(['98034', '98011', '98028']);
    expect(item.lastUpdated.S).toBeTruthy();
  });

  test('uses monthlySearchEstimate from cities.mjs for each city', async () => {
    await handler({});

    const findCity = (zip) => mockDbSend.mock.calls.find(c =>
      c[0].input.Item.zipCode.S === zip
    );

    // Bellevue — highest estimate
    const bellevue = findCity('98004');
    expect(bellevue[0].input.Item.monthlySearches.N).toBe('180');

    // Snohomish — lowest estimate
    const snohomish = findCity('98290');
    expect(snohomish[0].input.Item.monthlySearches.N).toBe('13');

    // Kent
    const kent = findCity('98030');
    expect(kent[0].input.Item.monthlySearches.N).toBe('162');

    // Woodinville
    const woodinville = findCity('98072');
    expect(woodinville[0].input.Item.monthlySearches.N).toBe('17');
  });

  test('every city has a positive monthlySearchEstimate', () => {
    for (const city of CITIES) {
      expect(city.monthlySearchEstimate).toBeGreaterThan(0);
    }
  });

  test('continues when one DynamoDB write fails', async () => {
    mockDbSend
      .mockRejectedValueOnce(new Error('DynamoDB throttle'))
      .mockResolvedValue({});

    const result = await handler({});
    const body = JSON.parse(result.body);

    expect(body.successCount).toBe(29);
    expect(body.failureCount).toBe(1);
    expect(result.statusCode).toBe(200);
    expect(mockDbSend).toHaveBeenCalledTimes(30);
  });

  test('handles all DynamoDB writes failing without throwing', async () => {
    mockDbSend.mockRejectedValue(new Error('DynamoDB unavailable'));

    const result = await handler({});
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.successCount).toBe(0);
    expect(body.failureCount).toBe(30);
  });

  test('does not make any external API calls', async () => {
    const originalFetch = global.fetch;
    const spyFetch = jest.fn();
    global.fetch = spyFetch;

    await handler({});

    expect(spyFetch).not.toHaveBeenCalled();
    global.fetch = originalFetch;
  });

  test('writes all 30 cities with correct estimates', async () => {
    await handler({});

    const written = mockDbSend.mock.calls.map(c => ({
      zip: c[0].input.Item.zipCode.S,
      city: c[0].input.Item.city.S,
      volume: c[0].input.Item.monthlySearches.N,
    }));

    // Verify count
    expect(written.length).toBe(30);

    // Verify every CITIES entry was written with its estimate
    // Match by city name (not zip) because Tukwila and SeaTac share 98188
    for (const city of CITIES) {
      const match = written.find(w => w.city === city.city);
      expect(match).toBeTruthy();
      expect(match.volume).toBe(String(city.monthlySearchEstimate));
    }
  });
});
