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

  test('successfully updates all 30 cities and emits metrics', async () => {
    mockFetch.mockResolvedValue(makeDataForSEOResponse(120));

    const result = await handler({});
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.successCount).toBe(30);
    expect(body.failureCount).toBe(0);

    // 30 DynamoDB PutItem calls
    expect(mockDbSend).toHaveBeenCalledTimes(30);

    // 30 fetch calls to DataForSEO
    expect(mockFetch).toHaveBeenCalledTimes(30);

    // Verify first fetch call has correct auth and keyword
    const firstCallArgs = mockFetch.mock.calls[0];
    expect(firstCallArgs[0]).toBe('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live');
    const firstBody = JSON.parse(firstCallArgs[1].body);
    expect(firstBody[0].keywords[0]).toContain('emergency dentist');

    // Verify auth header uses Basic auth
    expect(firstCallArgs[1].headers['Authorization']).toMatch(/^Basic /);

    // 3 CloudWatch metric calls (CitiesUpdated, Success, Failure)
    expect(mockCwSend).toHaveBeenCalledTimes(3);
  });

  test('writes correct data to DynamoDB for each city', async () => {
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

  test('continues processing when one city fails, logs error, emits failure metric', async () => {
    // First call fails, rest succeed
    mockFetch
      .mockResolvedValueOnce(makeDataForSEOError())
      .mockResolvedValue(makeDataForSEOResponse(100));

    const result = await handler({});
    const body = JSON.parse(result.body);

    expect(body.successCount).toBe(29);
    expect(body.failureCount).toBe(1);

    // 29 DynamoDB writes (1 failed before write)
    expect(mockDbSend).toHaveBeenCalledTimes(29);

    // Still returns 200
    expect(result.statusCode).toBe(200);
  });

  test('handles DataForSEO task-level error gracefully', async () => {
    mockFetch
      .mockResolvedValueOnce(makeDataForSEOTaskError())
      .mockResolvedValue(makeDataForSEOResponse(80));

    const result = await handler({});
    const body = JSON.parse(result.body);

    expect(body.successCount).toBe(29);
    expect(body.failureCount).toBe(1);
  });

  test('handles all cities failing without throwing', async () => {
    mockFetch.mockResolvedValue(makeDataForSEOError());

    const result = await handler({});
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.successCount).toBe(0);
    expect(body.failureCount).toBe(30);

    // No DynamoDB writes
    expect(mockDbSend).toHaveBeenCalledTimes(0);

    // CloudWatch metrics still emitted
    expect(mockCwSend).toHaveBeenCalledTimes(3);
  });

  test('emits SearchVolumeUpdateFailure metric when any city fails', async () => {
    mockFetch
      .mockResolvedValueOnce(makeDataForSEOError())
      .mockResolvedValue(makeDataForSEOResponse(50));

    await handler({});

    // Find the failure metric call
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

  test('handles search volume of 0 from API', async () => {
    mockFetch.mockResolvedValue(makeDataForSEOResponse(0));

    const result = await handler({});
    const body = JSON.parse(result.body);

    expect(body.successCount).toBe(30);

    const firstPut = mockDbSend.mock.calls[0][0];
    expect(firstPut.input.Item.monthlySearches.N).toBe('0');
  });

  test('handles fetch network error gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network timeout'));

    const result = await handler({});
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.successCount).toBe(0);
    expect(body.failureCount).toBe(30);
  });
});
