import { parseTestCountsFromBuildLog } from './codebuild-log-parser';

describe('parseTestCountsFromBuildLog', () => {
  describe('Jest Tests line', () => {
    it('parses failed + passed + total', () => {
      const log = 'Tests: 2 failed, 8 passed, 10 total';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 8,
        failed: 2,
        skipped: 0,
      });
    });

    it('parses passed-only variant', () => {
      const log = 'Tests:       8 passed, 10 total';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 8,
        failed: 0,
        skipped: 2,
      });
    });
  });

  describe('Jest Test Suites line', () => {
    it('parses failed + passed + total', () => {
      const log = 'Test Suites: 1 failed, 3 passed, 4 total';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 3,
        failed: 1,
        skipped: 0,
      });
    });

    it('parses passed-only variant', () => {
      const log = 'Test Suites: 3 passed, 3 total';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 3,
        failed: 0,
        skipped: 0,
      });
    });
  });

  describe('precedence: Tests line over Test Suites line', () => {
    it('returns Tests numbers when both are present', () => {
      const log = [
        'Test Suites: 9 failed, 1 passed, 10 total',
        'Tests:       2 failed, 8 passed, 10 total',
      ].join('\n');
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 8,
        failed: 2,
        skipped: 0,
      });
    });
  });

  describe('pytest summary', () => {
    it('parses passed, failed, and skipped', () => {
      const log = '===== 3 passed, 1 failed, 2 skipped in 0.12s =====';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 3,
        failed: 1,
        skipped: 2,
      });
    });

    it('folds errors into failed count', () => {
      const log =
        '======================== 1 passed, 2 failed, 1 error in 0.5s ========================';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 1,
        failed: 3,
        skipped: 0,
      });
    });

    it('parses passing-only summary', () => {
      const log = '===== 3 passed in 0.12s =====';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 3,
        failed: 0,
        skipped: 0,
      });
    });

    it('parses pytest with ANSI colors', () => {
      const log =
        '\u001b[32m======================== \u001b[32m3 passed\u001b[0m\u001b[32m in 0.12s\u001b[0m\u001b[32m ========================\u001b[0m';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 3,
        failed: 0,
        skipped: 0,
      });
    });
  });

  describe('Python unittest summary', () => {
    it('parses Ran N tests ... OK', () => {
      const log = 'Ran 5 tests in 0.003s\n\nOK';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 5,
        failed: 0,
        skipped: 0,
      });
    });

    it('parses FAILED (failures=N)', () => {
      const log = 'Ran 10 tests in 0.1s\n\nFAILED (failures=2)';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 8,
        failed: 2,
        skipped: 0,
      });
    });

    it('parses FAILED (errors=N)', () => {
      const log = 'Ran 6 tests in 0.05s\n\nFAILED (errors=1)';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 5,
        failed: 1,
        skipped: 0,
      });
    });
  });

  describe('.NET test output', () => {
    it('parses Failed! summary line', () => {
      const log = 'Failed!  - Failed:     1, Passed:     4, Skipped:     0, Total:     5';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 4,
        failed: 1,
        skipped: 0,
      });
    });

    it('parses Passed! summary line', () => {
      const log = 'Passed!  - Failed:     0, Passed:     4, Skipped:     0, Total:     4';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 4,
        failed: 0,
        skipped: 0,
      });
    });

    it('parses Total tests block', () => {
      const log = [
        'Total tests: 5',
        '     Passed: 4',
        '     Failed: 1',
        '    Skipped: 0',
      ].join('\n');
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 4,
        failed: 1,
        skipped: 0,
      });
    });
  });

  describe('Maven Surefire summary', () => {
    it('parses run, failures, errors, and skipped', () => {
      const log = 'Tests run: 6, Failures: 1, Errors: 1, Skipped: 1';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 3,
        failed: 2,
        skipped: 1,
      });
    });

    it('parses passing-only output', () => {
      const log = 'Tests run: 6, Failures: 0, Errors: 0, Skipped: 0';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 6,
        failed: 0,
        skipped: 0,
      });
    });
  });

  describe('Mocha summary', () => {
    it('parses passing / failing', () => {
      const log = '  12 passing (340ms)\n  1 failing';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 12,
        failed: 1,
        skipped: 0,
      });
    });

    it('parses passing-only output', () => {
      const log = '  12 passing (340ms)';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 12,
        failed: 0,
        skipped: 0,
      });
    });
  });

  describe('Gradle test summary', () => {
    it('parses tests completed with failures', () => {
      const log = '10 tests completed, 2 failed';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 8,
        failed: 2,
        skipped: 0,
      });
    });

    it('parses passing-only output', () => {
      const log = '10 tests completed';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 10,
        failed: 0,
        skipped: 0,
      });
    });
  });

  describe('Cargo test summary', () => {
    it('parses passed, failed, and ignored', () => {
      const log = 'test result: FAILED. 3 passed; 1 failed; 0 ignored';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 3,
        failed: 1,
        skipped: 0,
      });
    });

    it('parses passing-only output', () => {
      const log = 'test result: ok. 3 passed; 0 failed; 0 ignored';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 3,
        failed: 0,
        skipped: 0,
      });
    });
  });

  describe('TAP summary', () => {
    it('parses # pass / # fail lines (passing)', () => {
      const log = `[Container] ...
1..9
# tests 9
# suites 0
# pass 9
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 90.58142
`;
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 9,
        failed: 0,
        skipped: 0,
      });
    });

    it('parses # pass / # fail lines (failing)', () => {
      const log = `1..5
# pass 3
# fail 2
# skipped 1
`;
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 3,
        failed: 2,
        skipped: 1,
      });
    });
  });

  describe('log wrapped in ANSI colour codes', () => {
    it('strips codes and parses correctly', () => {
      const log =
        '\u001b[31mTests:\u001b[0m       \u001b[31m2 failed\u001b[0m, \u001b[32m8 passed\u001b[0m, 10 total';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 8,
        failed: 2,
        skipped: 0,
      });
    });
  });

  describe('CRLF line endings', () => {
    it('handles \\r\\n line endings', () => {
      const log = 'Tests: 2 failed, 8 passed, 10 total\r\nDone.\r\n';
      expect(parseTestCountsFromBuildLog(log)).toEqual({
        passed: 8,
        failed: 2,
        skipped: 0,
      });
    });
  });

  describe('unrecognised log', () => {
    it('returns null', () => {
      const log = 'Building project...\nSUCCESS\n';
      expect(parseTestCountsFromBuildLog(log)).toBeNull();
    });
  });
});
