// Store 入口文件
// 现在使用 API 模式，旧 localStorage 代码已迁移到 api.js

// 导出所有 API 操作
export * from './api';

// 向后兼容的导出
export {
  studentOps,
  packageOps,
  classOps,
  paymentOps,
  teacherOps,
  teacherPaymentOps,
  courseOps,
  settingsOps,
  getStats,
  getTodayClasses,
  searchAll,
  exportData,
  importData,
  loadData,
  saveData,
} from './api';
