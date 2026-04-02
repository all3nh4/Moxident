// tests/search-volume-updater.test.mjs
//
// Tests for the moxident-search-volume-updater Lambda.
// Mocks: fetch (DataForSEO API), DynamoDB, CloudWatch.

import { jest } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDbSend = jest.fn();
const mockCwSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockDbSend })),
  PutItemCommand: jest.fn(input => ({ type: 'PutItemCommand', input })),
}));

jest.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatchClient:     jest.fn(() => ({ send: mockCwSend })),
  PutMetricDataCommand: jest.fn(input => ({ type: 'PutMetricDataCommand', input })),
}));

// Mock global fetch for DataForSEO API
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Set env vars before import
process.env.DATAFORSEO_LOGIN = 'test-login';
process.env.DATAFORSEO_PASSWORD = 'test-password';

const { handler } = await import('../src/search-volume-updater.mjs');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDataForSEOResponse(searchVolume) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      tasks: [{
        status_code: 20000,
        status_message: "Ok.",
        result: [{ search_volume: searchVolume }],
      }],
    }),
  };
}

function makeDataForSEOError() {
  return {
    ok: false,
    status: 500,
    statusText: "Internal Server Error",
    json: async () => ({}),
  };
}

function makeDataForSEOTaskError() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      tasks: [{
        status_code: 40000,
        status_message: "Task failed",
        result: null,
      }],
    }),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('search-volume-updater Lambda', () => {
  beforeEach(() => {
    mockDbSend.mockResolvedValue({});
    mockCwSend.mockResolvedValue({});
  });

  afterEach(() => jest.clearAllMocks());

  test('fetches 5 metro keywords and writes all 30 cities to DynamoDB', async () => {
    mockFetch.mockResolvedValue(makeDataForSEOResponse(120));

    const result = await handler({});
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.successCount).toBe(30);
    expect(body.failureCount).toBe(0);
    expect(body.metroFailures).toBe(0);

    // 5 fetch calls (one per metro keyword)
    expect(mockFetch).toHaveBeenCalledTimes(5);

    // 30 DynamoDB PutItem calls (one per city)
    expect(mockDbSend).toHaveBeenCalledTimes(30);

    // 3 CloudWatch metric calls (CitiesUpdated, Success, Failure)
    expect(mockCwSend).toHaveBeenCalledTimes(3);
  });

  test('fetch calls use correct metro keywords', async () => {
    mockFetch.mockResolvedValue(makeDataForSEOResponse(100));

    await handler({});

    const keywords = mockFetch.mock.calls.map(c => JSON.parse(c[1].body)[0].keywords[0]);
    expect(keywords).toEqual([
      "emergency dentist Seattle",
      "emergency dentist Bellevue",
      "emergency dentist Everett",
      "emergency dentist Bothell",
      "emergency dentist Maple Valley",
    ]);
  });

  test('uses Basic auth from env vars', async () => {
    mockFetch.mockResolvedValue(makeDataForSEOResponse(100));

    await handler({});

    const authHeader = mockFetch.mock.calls[0][1].headers['Authorization'];
    const expected = 'Basic ' + Buffer.from('test-login:test-password').toString('base64');
    expect(authHeader).toBe(expected);
  });

  test('multi-metro city gets the highest volume', async () => {
    // Seattle metro returns 500, Bellevue metro returns 800
    // "bellevue" slug is in both → should get 800
    // "redmond" slug is in both → should get 800
    mockFetch
      .mockResolvedValueOnce(makeDataForSEOResponse(500))  // Seattle
      .mockResolvedValueOnce(makeDataForSEOResponse(800))  // Bellevue
      .mockResolvedValueOnce(makeDataForSEOResponse(60))   // Everett
      .mockResolvedValueOnce(makeDataForSEOResponse(40))   // Bothell
      .mockResolvedValueOnce(makeDataForSEOResponse(30));   // Maple Valley

    await handler({});

    // Find the Bellevue write (primaryZip 98004)
    const bellevuePut = mockDbSend.mock.calls.find(c =>
      c[0].input.Item.zipCode.S === '98004'
    );
    expect(bellevuePut[0].input.Item.monthlySearches.N).toBe('800');

    // Redmond (98052) also in Seattle + Bellevue → should get 800
    const redmondPut = mockDbSend.mock.calls.find(c =>
      c[0].input.Item.zipCode.S === '98052'
    );
    expect(redmondPut[0].input.Item.monthlySearches.N).toBe('800');

    // Kirkland (98033) only in Seattle → should get 500
    const kirklandPut = mockDbSend.mock.calls.find(c =>
      c[0].input.Item.zipCode.S === '98033'
    );
    expect(kirklandPut[0].input.Item.monthlySearches.N).toBe('500');

    // Everett (98201) only in Everett metro → should get 60
    const everettPut = mockDbSend.mock.calls.find(c =>
      c[0].input.Item.zipCode.S === '98201'
    );
    expect(everettPut[0].input.Item.monthlySearches.N).toBe('60');
  });

  test('writes correct DynamoDB item shape', async () => {
    mockFetch.mockResolvedValue(makeDataForSEOResponse(250));

    await handler({});

    const firstPut = mockDbSend.mock.calls[0][0];
    const item = firstPut.input.Item;

    expect(item.zipCode.S).toBe('98033'); // Kirkland is first
    expect(item.city.S).toBe('Kirkland');
    expect(item.monthlySearches.N).toBe('250');
    expect(item.adjacentZips.SS).toEqual(['98034', '98011', '98028']);
    expect(item.lastUpdated.S).toBeTruthy();
  });

  test('continues writing cities when one metro fetch fails', async () => {
    // Seattle metro fails, rest succeed
    mockFetch
      .mockResolvedValueOnce(makeDataForSEOError())         // Seattle fails
      .mockResolvedValueOnce(makeDataForSEOResponse(100))   // Bellevue
      .mockResolvedValueOnce(makeDataForSEOResponse(80))    // Everett
      .mockResolvedValueOnce(makeDataForSEOResponse(60))    // Bothell
      .mockResolvedValueOnce(makeDataForSEOResponse(40));    // Maple Valley

    const result = await handler({});
    const body = JSON.parse(result.body);

    // All 30 cities still written to DynamoDB (Seattle-only cities get 0)
    expect(body.successCount).toBe(30);
    expect(body.failureCount).toBe(0);
    expect(body.metroFailures).toBe(1);
    expect(mockDbSend).toHaveBeenCalledTimes(30);

    // Still returns 200
    expect(result.statusCode).toBe(200);
  });

  test('cities only in failed metro get 0 volume', async () => {
    // Seattle fails, Bellevue succeeds with 300
    mockFetch
      .mockResolvedValueOnce(makeDataForSEOError())         // Seattle fails
      .mockResolvedValueOnce(makeDataForSEOResponse(300))   // Bellevue
      .mockResolvedValueOnce(makeDataForSEOResponse(80))    // Everett
      .mockResolvedValueOnce(makeDataForSEOResponse(60))    // Bothell
      .mockResolvedValueOnce(makeDataForSEOResponse(40));    // Maple Valley

    await handler({});

    // Shoreline (98133) is only in Seattle metro → should get 0
    const shorelinePut = mockDbSend.mock.calls.find(c =>
      c[0].input.Item.zipCode.S === '98133'
    );
    expect(shorelinePut[0].input.Item.monthlySearches.N).toBe('0');

    // Bellevue (98004) is in Seattle AND Bellevue → should get 300 (from Bellevue metro)
    const bellevuePut = mockDbSend.mock.calls.find(c =>
      c[0].input.Item.zipCode.S === '98004'
    );
    expect(bellevuePut[0].input.Item.monthlySearches.N).toBe('300');
  });

  test('handles DataForSEO task-level error gracefully', async () => {
    mockFetch
      .mockResolvedValueOnce(makeDataForSEOTaskError())     // Seattle task error
      .mockResolvedValue(makeDataForSEOResponse(80));

    const result = await handler({});
    const body = JSON.parse(result.body);

    expect(body.metroFailures).toBe(1);
    expect(body.successCount).toBe(30);
  });

  test('handles all metros failing without throwing', async () => {
    mockFetch.mockResolvedValue(makeDataForSEOError());

    const result = await handler({});
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.metroFailures).toBe(5);
    expect(body.successCount).toBe(30);  // DynamoDB writes still happen with 0
    expect(body.failureCount).toBe(0);

    // All cities written with 0
    expect(mockDbSend).toHaveBeenCalledTimes(30);
    const firstPut = mockDbSend.mock.calls[0][0];
    expect(firstPut.input.Item.monthlySearches.N).toBe('0');

    // CloudWatch metrics still emitted
    expect(mockCwSend).toHaveBeenCalledTimes(3);
  });

  test('emits SearchVolumeUpdateFailure metric when any metro fails', async () => {
    mockFetch
      .mockResolvedValueOnce(makeDataForSEOError())
      .mockResolvedValue(makeDataForSEOResponse(50));

    await handler({});

    const metricCalls = mockCwSend.mock.calls.map(c => c[0].input);
    const failureMetric = metricCalls.find(m =>
      m.MetricData?.[0]?.MetricName === 'SearchVolumeUpdateFailure'
    );

    expect(failureMetric).toBeTruthy();
    expect(failureMetric.Namespace).toBe('Moxident/SearchVolume');
    expect(failureMetric.MetricData[0].Value).toBe(1);
  });

  test('emits CitiesUpdated metric with correct count', async () => {
    mockFetch.mockResolvedValue(makeDataForSEOResponse(200));

    await handler({});

    const metricCalls = mockCwSend.mock.calls.map(c => c[0].input);
    const citiesMetric = metricCalls.find(m =>
      m.MetricData?.[0]?.MetricName === 'CitiesUpdated'
    );

    expect(citiesMetric).toBeTruthy();
    expect(citiesMetric.MetricData[0].Value).toBe(30);
  });

  test('emits SearchVolumeUpdateSuccess=1 only when zero failures', async () => {
    mockFetch.mockResolvedValue(makeDataForSEOResponse(100));

    await handler({});

    const metricCalls = mockCwSend.mock.calls.map(c => c[0].input);
    const successMetric = metricCalls.find(m =>
      m.MetricData?.[0]?.MetricName === 'SearchVolumeUpdateSuccess'
    );

    expect(successMetric.MetricData[0].Value).toBe(1);
  });

  test('handles search volume of 0 from API', async () => {
    mockFetch.mockResolvedValue(makeDataForSEOResponse(0));

    const result = await handler({});
    const body = JSON.parse(result.body);

    expect(body.successCount).toBe(30);
    expect(body.metroFailures).toBe(0);

    const firstPut = mockDbSend.mock.calls[0][0];
    expect(firstPut.input.Item.monthlySearches.N).toBe('0');
  });

  test('handles fetch network error gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network timeout'));

    const result = await handler({});
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.metroFailures).toBe(5);
    expect(body.successCount).toBe(30);  // DynamoDB writes still happen with 0
  });
});
