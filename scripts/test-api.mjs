/**
 * SuB CRM API Integration Tests - Local Dev Server
 * 针对本地 Wrangler Dev Server (http://127.0.0.1:8787/api/v1)
 * 与生产环境完全隔离，使用本地 D1
 */

const BASE = 'http://127.0.0.1:8787/api/v1';
const API_KEY = 'sunnyb...2024';
const HEADERS = {
  'Content-Type': 'application/json',
  'X-API-Key': API_KEY,
  'X-User-Role': 'super_admin',
};

let passed = 0, failed = 0;
const failures = [];

const log = (sym, msg) => console.log(`  ${sym} ${msg}`);

async function assert(label, fn) {
  try {
    await fn();
    passed++;
    log('✅', label);
  } catch (err) {
    failed++;
    failures.push({ label, err: err.message });
    log('❌', `${label} → ${err.message}`);
  }
}

async function api(method, path, body) {
  const opts = { method, headers: { ...HEADERS } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

function expect(val, msg) { if (!val) throw new Error(msg || `Assertion failed: ${JSON.stringify(val)}`); }
function expectEq(a, b, msg) { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function expectGte(a, b, msg) { if (a < b) throw new Error(msg || `Expected >= ${b}, got ${a}`); }
function expectNotNull(a, msg) { if (a === null || a === undefined) throw new Error(msg || `Expected non-null, got null`); }

const state = {};

async function runT1() {
  console.log('\n🔴 T1 - 严重 Bug 验证\n');

  await assert('T1-1 GET /students/list?sort=name&order=asc 不崩溃 (Bug1 safeSortOrder)', async () => {
    const { status, body } = await api('GET', '/students/list?sort=name&order=asc');
    expect(status === 200 || status === 404, `期望 200/404，实际 ${status}: ${body.raw || JSON.stringify(body)}`);
    if (status === 200) expect(Array.isArray(body.data?.data), '期望 data.data 是数组');
  });

  await assert('T1-2a 准备: 创建测试学生', async () => {
    const { status, body } = await api('POST', '/students', { name: 'T1测试学生', grade: 'A1' });
    expect(status === 201, `期望 201，实际 ${status}: ${JSON.stringify(body)}`);
    state.studentId = body.data?.id;
    expectNotNull(state.studentId);
  });

  await assert('T1-2b 准备: 为学生创建 scheduled 课程', async () => {
    const today = new Date().toISOString().split('T')[0];
    const { status, body } = await api('POST', `/classes/student/${state.studentId}`, {
      date: today, start_time: '10:00', duration: 50,
      subject: 'English', status: 'scheduled', hours: 1,
    });
    expect(status === 201, `期望 201，实际 ${status}: ${JSON.stringify(body)}`);
    state.classId = body.data?.id;
    expectNotNull(state.classId);
  });

  await assert('T1-3 DELETE /teacher-payments/99999 返回 404 不崩溃 (Bug3 重复路由)', async () => {
    const { status } = await api('DELETE', '/teacher-payments/99999');
    expect(status === 404, `期望 404，实际 ${status}`);
  });
}

async function runT2() {
  console.log('\n🟠 T2 - 重要 Bug 验证\n');

  await assert('T2-1 GET /organizations/1 teacher_count 正常 (Bug6 SQL注入修复)', async () => {
    const { status, body } = await api('GET', '/organizations/1');
    expect(status === 200 || status === 404, `期望 200/404，实际 ${status}`);
    if (status === 200 && body.data?.stats) {
      expect(typeof body.data.stats.teacher_count === 'number', `teacher_count 应为数字`);
    }
  });

  await assert('T2-2a 准备: 创建付款记录', async () => {
    if (!state.studentId) throw new Error('依赖 studentId');
    const { status, body } = await api('POST', `/payments/student/${state.studentId}`, {
      amount: 500, payment_method: 'wechat', description: 'T2测试',
    });
    expect(status === 201, `期望 201，实际 ${status}: ${JSON.stringify(body)}`);
    state.paymentId = body.data?.id;
    expectNotNull(state.paymentId);
  });

  await assert('T2-2b PATCH /payments/:id 响应有 created_at 无 updated_at (Bug7)', async () => {
    const { status, body } = await api('PATCH', `/payments/${state.paymentId}`, { description: '已修改' });
    expect(status === 200, `期望 200，实际 ${status}: ${JSON.stringify(body)}`);
    expectNotNull(body.data?.created_at, '期望有 created_at');
    expect(body.data?.updated_at === undefined, `期望无 updated_at，得到: ${body.data?.updated_at}`);
  });

  await assert('T2-3a 查询学生当前 used_hours', async () => {
    const { status, body } = await api('GET', `/students/${state.studentId}`);
    expect(status === 200, `期望 200，实际 ${status}`);
    state.usedBefore = body.data?.used_hours ?? 0;
  });

  await assert('T2-3b 创建体验课 is_trial=1 hours 为 0 (Bug5)', async () => {
    const today = new Date().toISOString().split('T')[0];
    const { status, body } = await api('POST', `/classes/student/${state.studentId}`, {
      date: today, start_time: '11:00', duration: 50,
      subject: 'Trial', status: 'completed', is_trial: 1,
    });
    expect(status === 201, `期望 201，实际 ${status}: ${JSON.stringify(body)}`);
    state.trialId = body.data?.id;
    expectEq(body.data?.hours, 0, `体验课 hours 期望 0，得到 ${body.data?.hours}`);
  });

  await assert('T2-3c 体验课后 used_hours 不变 (Bug5)', async () => {
    const { status, body } = await api('GET', `/students/${state.studentId}`);
    expect(status === 200);
    expectEq(body.data?.used_hours, state.usedBefore,
      `used_hours 应不变: 之前=${state.usedBefore}, 之后=${body.data?.used_hours}`);
  });
}

async function runT3() {
  console.log('\n🟢 T3 - 核心 CRUD 回归测试\n');

  await assert('T3-1a 创建学生', async () => {
    const { status, body } = await api('POST', '/students', { name: 'T3回归学生', phone: '13900000001', grade: 'A2' });
    expect(status === 201, `期望 201，实际 ${status}: ${JSON.stringify(body)}`);
    state.s2Id = body.data?.id;
    expectNotNull(state.s2Id);
  });

  await assert('T3-1b 查询学生详情', async () => {
    const { status, body } = await api('GET', `/students/${state.s2Id}`);
    expect(status === 200);
    expectEq(body.data?.name, 'T3回归学生');
  });

  await assert('T3-1c 更新学生', async () => {
    const { status } = await api('PATCH', `/students/${state.s2Id}`, { grade: 'A2+', notes: '已更新' });
    expect(status === 200, `期望 200，实际 ${status}`);
  });

  await assert('T3-1d 学生列表含 pagination（Issue12）', async () => {
    const { status, body } = await api('GET', '/students?page=1&page_size=5');
    expect(status === 200);
    expectNotNull(body.data?.pagination, '期望有 pagination');
    expect(typeof body.data.pagination.total === 'number', 'total 应为数字');
  });

  await assert('T3-2a 创建课时包', async () => {
    const { status, body } = await api('POST', `/packages/student/${state.s2Id}`, {
      name: '10节套餐', total: 10, price: 800,
    });
    expect(status === 201, `期望 201，实际 ${status}: ${JSON.stringify(body)}`);
    state.pkgId = body.data?.id;
    expectNotNull(state.pkgId);
  });

  await assert('T3-2b 查询学生课时包列表', async () => {
    const { status, body } = await api('GET', `/packages/student/${state.s2Id}`);
    expect(status === 200);
    expect(body.data?.data?.length > 0, '期望至少1个包');
  });

  await assert('T3-2c 调整课时包 +5', async () => {
    const { status, body } = await api('POST', `/packages/${state.pkgId}/adjust`, { adjustment: 5, reason: '赠送' });
    expect(status === 200, `期望 200，实际 ${status}: ${JSON.stringify(body)}`);
    expectEq(body.data?.new_total, 15, `期望 new_total=15，得到 ${body.data?.new_total}`);
  });

  await assert('T3-3a 给学生充值 10 课时', async () => {
    const { status, body } = await api('PATCH', `/students/${state.s2Id}/adjust-hours`, { adjustment: 10, reason: '测试充值' });
    expect(status === 200, `期望 200，实际 ${status}: ${JSON.stringify(body)}`);
  });

  await assert('T3-3b 创建 50 分钟正式课（hours 应=1）', async () => {
    const today = new Date().toISOString().split('T')[0];
    const { status, body } = await api('POST', `/classes/student/${state.s2Id}`, {
      date: today, start_time: '09:00', duration: 50,
      subject: 'Reading', status: 'completed', is_trial: 0,
    });
    expect(status === 201, `期望 201，实际 ${status}: ${JSON.stringify(body)}`);
    state.cls2Id = body.data?.id;
    expectEq(body.data?.hours, 1, `50分钟 hours 期望 1，得到 ${body.data?.hours}`);
  });

  await assert('T3-3c 正式课后 used_hours +1', async () => {
    const { status, body } = await api('GET', `/students/${state.s2Id}`);
    expect(status === 200);
    expectGte(body.data?.used_hours, 1, `used_hours 期望 >=1`);
    state.usedAfterClass = body.data?.used_hours;
  });

  await assert('T3-3d 删除课程后 used_hours 回滚', async () => {
    const { status } = await api('DELETE', `/classes/${state.cls2Id}`);
    expect(status === 200 || status === 204, `删除期望 200/204，实际 ${status}`);
    const { body } = await api('GET', `/students/${state.s2Id}`);
    const after = body.data?.used_hours;
    expectEq(after, state.usedAfterClass - 1, `回滚后期望 ${state.usedAfterClass - 1}，得到 ${after}`);
  });

  await assert('T3-4a 创建带课时的付款记录', async () => {
    const { status, body } = await api('POST', `/payments/student/${state.s2Id}`, {
      amount: 1200, payment_method: 'alipay', hours: 15, description: '购买15节',
    });
    expect(status === 201, `期望 201，实际 ${status}: ${JSON.stringify(body)}`);
    state.p2Id = body.data?.id;
    expectNotNull(state.p2Id);
  });

  await assert('T3-4b 付款后 total_hours 增加', async () => {
    const { status, body } = await api('GET', `/students/${state.s2Id}`);
    expect(status === 200);
    expectGte(body.data?.total_hours, 20, `total_hours 期望 >=20，得到 ${body.data?.total_hours}`);
  });

  await assert('T3-5a 创建教师', async () => {
    const { status, body } = await api('POST', '/teachers', {
      name: 'T3测试老师', phone: '13800000002', hourly_rate: 150, hourly_rate_25: 80,
    });
    expect(status === 201, `期望 201，实际 ${status}: ${JSON.stringify(body)}`);
    state.teacherId = body.data?.id;
    expectNotNull(state.teacherId);
  });

  await assert('T3-5b GET /teachers 格式: data.data 存在, data.items 不存在 (Issue11)', async () => {
    const { status, body } = await api('GET', '/teachers');
    expect(status === 200);
    expect(Array.isArray(body.data?.data), `期望 data.data 是数组，实际: ${JSON.stringify(Object.keys(body.data||{}))}`);
    expect(body.data?.items === undefined, `data.items 应不存在（期望格式已统一）`);
  });

  await assert('T3-6 hour_changes 有 balance_after 非 NULL (Issue9)', async () => {
    const { status, body } = await api('GET', `/hour-changes/student/${state.s2Id}`);
    expect(status === 200, `期望 200，实际 ${status}`);
    const changes = body.data?.data || [];
    expect(changes.length > 0, '期望至少1条变动记录');
    const withBal = changes.filter(c => c.balance_after !== null && c.balance_after !== undefined);
    expect(withBal.length > 0, `期望有 balance_after，共 ${changes.length} 条全为 NULL`);
  });
}

async function runT4() {
  console.log('\n🔵 T4 - Issue 专项\n');

  await assert('T4-1 GET /receivables 返回 404（后端未实现）', async () => {
    const { status } = await api('GET', '/receivables');
    expect(status === 404, `期望 404，实际 ${status}`);
  });

  await assert('T4-2 GET /search?q=测试 正常', async () => {
    const { status } = await api('GET', '/search?q=%E6%B5%8B%E8%AF%95');
    expect(status === 200, `期望 200，实际 ${status}`);
  });

  await assert('T4-3 GET /hour-changes/student/:id 有 current_balance', async () => {
    if (!state.s2Id) throw new Error('依赖 T3 学生');
    const { status, body } = await api('GET', `/hour-changes/student/${state.s2Id}`);
    expect(status === 200);
    expectNotNull(body.data?.current_balance, '期望有 current_balance');
    expectNotNull(body.data?.pagination, '期望有 pagination');
  });
}

async function cleanup() {
  console.log('\n🧹 清理测试数据...\n');
  const dels = [
    state.trialId && ['DELETE', `/classes/${state.trialId}`, `体验课 #${state.trialId}`],
    state.classId && ['DELETE', `/classes/${state.classId}`, `课程 #${state.classId}`],
    state.cls2Id && ['DELETE', `/classes/${state.cls2Id}`, `课程 #${state.cls2Id}`],
    state.paymentId && ['DELETE', `/payments/${state.paymentId}`, `付款 #${state.paymentId}`],
    state.p2Id && ['DELETE', `/payments/${state.p2Id}`, `付款 #${state.p2Id}`],
    state.pkgId && ['DELETE', `/packages/${state.pkgId}`, `课时包 #${state.pkgId}`],
    state.studentId && ['DELETE', `/students/${state.studentId}`, `学生 #${state.studentId}`],
    state.s2Id && ['DELETE', `/students/${state.s2Id}`, `学生 #${state.s2Id}`],
    state.teacherId && ['DELETE', `/teachers/${state.teacherId}`, `教师 #${state.teacherId}`],
  ].filter(Boolean);

  for (const [method, path, label] of dels) {
    await api(method, path);
    log('🗑', `已删除 ${label}`);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  SuB CRM API 集成测试 (本地 D1 完全隔离)');
  console.log(`  目标: ${BASE}`);
  console.log(`  时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log('═══════════════════════════════════════════════════════');

  try {
    const r = await fetch('http://127.0.0.1:8787/health');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    console.log('\n  ✅ 本地服务器在线，开始测试...');
  } catch (e) {
    console.error(`\n❌ 无法连接 http://127.0.0.1:8787/health: ${e.message}`);
    process.exit(1);
  }

  try {
    await runT1();
    await runT2();
    await runT3();
    await runT4();
  } finally {
    await cleanup();
  }

  const total = passed + failed;
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  测试结果');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  总计 ${total} 项  ✅ ${passed} 通过  ❌ ${failed} 失败`);
  console.log(`  通过率: ${((passed/total)*100).toFixed(1)}%`);
  if (failures.length) {
    console.log('\n  失败详情：');
    failures.forEach(({label, err}) => console.log(`    ❌ ${label}\n       ${err}`));
  }
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('异常:', e); process.exit(1); });