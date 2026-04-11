import { parseTestCountsFromBuildLog } from './codebuild-log-parser';

describe('parseTestCountsFromBuildLog', () => {
  it('parses pytest with ANSI colors', () => {
    const log =
      '\u001b[32m======================== \u001b[32m3 passed\u001b[0m\u001b[32m in 0.12s\u001b[0m\u001b[32m ========================\u001b[0m';
    expect(parseTestCountsFromBuildLog(log)).toEqual({
      passed: 3,
      failed: 0,
      skipped: 0,
    });
  });

  it('parses pytest failed + errors', () => {
    const log =
      '======================== 1 passed, 2 failed, 1 error in 0.5s ========================';
    expect(parseTestCountsFromBuildLog(log)).toEqual({
      passed: 1,
      failed: 3,
      skipped: 0,
    });
  });

  it('parses Jest Tests line', () => {
    const log = 'Tests:       4 failed, 8 passed, 12 total';
    expect(parseTestCountsFromBuildLog(log)).toEqual({
      passed: 8,
      failed: 4,
      skipped: 0,
    });
  });

  it('parses Mocha passing / failing', () => {
    const log = '  12 passing (340ms)\n  2 failing';
    expect(parseTestCountsFromBuildLog(log)).toEqual({
      passed: 12,
      failed: 2,
      skipped: 0,
    });
  });

  it('parses Node.js node --test TAP summary', () => {
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
});
