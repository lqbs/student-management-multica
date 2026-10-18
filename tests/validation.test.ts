import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  escapeLike,
  formatScore,
  likePattern,
  normalizeSearch,
  normalizeStudentNo,
  parseClassIdFilter,
  parsePageSizeParam,
  scoreLevel,
  validateClassId,
  validateName,
  validatePositiveId,
  validateScore,
  validateStudentNo,
} from '../src/shared/validation.js';

describe('学号规范化与校验', () => {
  it('去空白、转大写并保留前导零', () => {
    assert.equal(normalizeStudentNo('  001  '), '001');
    assert.equal(normalizeStudentNo('s2026-01'), 'S2026-01');
  });

  it('接受字母、数字与连字符', () => {
    const result = validateStudentNo('001');
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value, '001');
  });

  it('拒绝空值、非法字符与超长学号', () => {
    assert.equal(validateStudentNo('   ').ok, false);
    assert.equal(validateStudentNo('张三').ok, false);
    assert.equal(validateStudentNo('a'.repeat(33)).ok, false);
    assert.equal(validateStudentNo('001 002').ok, false);
  });
});

describe('姓名 / 班级 / 科目名称校验', () => {
  it('拒绝空白并限制长度', () => {
    assert.equal(validateName('   ', '姓名').ok, false);
    assert.equal(validateName('演示学生01', '姓名').ok, true);
    assert.equal(validateName('甲'.repeat(51), '姓名').ok, false);
  });

  it('班级 ID 支持未分班与正整数', () => {
    const unassigned = validateClassId('');
    assert.equal(unassigned.ok, true);
    assert.equal(unassigned.ok && unassigned.value, null);
    const unassigned2 = validateClassId('unassigned');
    assert.equal(unassigned2.ok && unassigned2.value, null);
    const id = validateClassId('12');
    assert.equal(id.ok && id.value, 12);
    assert.equal(validateClassId('abc').ok, false);
    assert.equal(validateClassId('-1').ok, false);
  });

  it('列表筛选参数解析', () => {
    assert.equal(parseClassIdFilter(''), null);
    assert.equal(parseClassIdFilter('all'), null);
    assert.equal(parseClassIdFilter('unassigned'), 'unassigned');
    assert.equal(parseClassIdFilter('3'), 3);
    assert.equal(parseClassIdFilter('abc'), null);
  });

  it('记录 ID 校验', () => {
    const result = validatePositiveId('7', '学生');
    assert.equal(result.ok && result.value, 7);
    assert.equal(validatePositiveId('0').ok, false);
    assert.equal(validatePositiveId('1.5').ok, false);
  });
});

describe('成绩校验（十分值存储）', () => {
  it('接受边界值与一位小数', () => {
    assert.deepEqual(validateScore('0'), { ok: true, value: 0 });
    assert.deepEqual(validateScore('100'), { ok: true, value: 1000 });
    assert.deepEqual(validateScore('99.5'), { ok: true, value: 995 });
    assert.deepEqual(validateScore(' 89.5 '), { ok: true, value: 895 });
    assert.deepEqual(validateScore('0.0'), { ok: true, value: 0 });
  });

  it('拒绝空值、负数、超范围、多位小数与科学计数法', () => {
    for (const raw of ['', '   ', '-1', '100.1', '99.55', '1e2', 'NaN', 'Infinity', 'abc', '.5', '100.']) {
      const result = validateScore(raw);
      assert.equal(result.ok, false, `期望拒绝：${JSON.stringify(raw)}`);
    }
  });

  it('分数展示与分级', () => {
    assert.equal(formatScore(0), '0');
    assert.equal(formatScore(1000), '100');
    assert.equal(formatScore(995), '99.5');
    assert.equal(scoreLevel(599), 'danger');
    assert.equal(scoreLevel(600), 'plain');
    assert.equal(scoreLevel(900), 'success');
  });
});

describe('搜索与分页辅助', () => {
  it('转义 LIKE 通配符，避免 % 与 _ 被当作通配', () => {
    assert.equal(escapeLike('50%_'), '50\\%\\_');
    assert.equal(likePattern('张'), '%张%');
  });

  it('搜索关键字截断到 100 字符', () => {
    assert.equal(normalizeSearch(' 张 '), '张');
    assert.equal(normalizeSearch('a'.repeat(150)).length, 100);
  });

  it('每页条数默认 20、最大 100', () => {
    assert.equal(parsePageSizeParam(''), 20);
    assert.equal(parsePageSizeParam('0'), 20);
    assert.equal(parsePageSizeParam('10'), 10);
    assert.equal(parsePageSizeParam('1000'), 100);
  });
});
