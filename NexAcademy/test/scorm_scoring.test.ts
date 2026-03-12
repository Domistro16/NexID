import { expect } from 'chai';
import {
  deriveScormMetrics,
  parseScorm12TimeToSeconds,
  parseScorm2004DurationToSeconds,
} from '../webapp/lib/scorm/scoring';

describe('SCORM scoring utilities', function () {
  it('normalizes SCORM 1.2 raw score and session time', function () {
    const metrics = deriveScormMetrics(
      {
        'cmi.core.lesson_status': 'completed',
        'cmi.core.score.raw': '42',
        'cmi.core.score.min': '0',
        'cmi.core.score.max': '84',
        'cmi.core.session_time': '00:10:30',
      },
      0
    );

    expect(metrics.quizScore).to.equal(50);
    expect(metrics.totalTimeSeconds).to.equal(630);
    expect(metrics.isCompleted).to.equal(true);
  });

  it('converts scaled score when raw score is missing', function () {
    const metrics = deriveScormMetrics(
      {
        'cmi.completion_status': 'completed',
        'cmi.success_status': 'passed',
        'cmi.score.scaled': '0.83',
      },
      0
    );

    expect(metrics.quizScore).to.equal(83);
    expect(metrics.isCompleted).to.equal(true);
    expect(metrics.isSuccessful).to.equal(true);
  });

  it('parses SCORM duration formats', function () {
    expect(parseScorm12TimeToSeconds('01:02:03')).to.equal(3723);
    expect(parseScorm2004DurationToSeconds('PT1H2M3S')).to.equal(3723);
  });
});

