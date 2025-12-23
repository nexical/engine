import { SystemError } from '../../../src/errors/SystemError.js';

describe('SystemError', () => {
  it('should create IO error', () => {
    const error = SystemError.io('File not found', '/path/to/file');
    expect(error).toBeInstanceOf(SystemError);
    expect(error.code).toBe('IO_ERROR');
    expect(error.metadata).toEqual({ path: '/path/to/file' });
  });

  it('should create network error', () => {
    const error = SystemError.network('Connection failed', 'http://example.com');
    expect(error).toBeInstanceOf(SystemError);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.metadata).toEqual({ url: 'http://example.com' });
  });

  it('should use default code and metadata', () => {
    const error = new SystemError('Generic system error');
    expect(error.code).toBe('SYSTEM_ERROR');
    expect(error.metadata).toEqual({});
  });

  it('should have correct name property', () => {
    const error = new SystemError('test');
    expect(error.name).toBe('SystemError');
  });
});
