import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import PasswordProtect from './components/PasswordProtect';
import { LayoutDashboard, Users, CreditCard, Settings, Calendar, GraduationCap, CalendarDays, Building2, Receipt, Package, Book } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import StudentDetail from './pages/StudentDetail';
import Payments from './pages/Payments';
import SettingsPage from './pages/Settings';
import ParentView from './pages/ParentView';
import Classes from './pages/Classes';
import Teachers from './pages/Teachers';
import Schedule from './pages/Schedule';
import TeacherPortal from './pages/TeacherPortal';
import TeacherShare from './pages/TeacherShare';
import Organizations from './pages/Organizations';
import OrgLogin from './pages/OrgLogin';
import OrgPortal from './pages/OrgPortal';
import OrgSettlements from './pages/OrgSettlements';
import OrgPackages from './pages/OrgPackages';
import Textbooks from './pages/Textbooks';

function Sidebar() {
  return (
    <div className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      <div className="p-5 border-b border-gray-200 flex items-center gap-3">
        <img src="/sunblogo.webp" alt="SunnyBridge" className="w-10 h-10 object-contain flex-shrink-0" />
        <div>
          <h1 className="text-lg font-bold text-primary-600 leading-tight">SunnyBridge</h1>
          <p className="text-xs text-gray-500">阳光桥少儿英语 CRM</p>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'
            }`
          }
        >
          <LayoutDashboard size={20} />
          <span>仪表盘</span>
        </NavLink>
        <NavLink
          to="/students"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'
            }`
          }
        >
          <Users size={20} />
          <span>学生管理</span>
        </NavLink>
        <NavLink
          to="/payments"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'
            }`
          }
        >
          <CreditCard size={20} />
          <span>收款记录</span>
        </NavLink>
        <NavLink
          to="/classes"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'
            }`
          }
        >
          <Calendar size={20} />
          <span>上课记录</span>
        </NavLink>
        <NavLink
          to="/teachers"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'
            }`
          }
        >
          <GraduationCap size={20} />
          <span>教师管理</span>
        </NavLink>
        <NavLink
          to="/schedule"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'
            }`
          }
        >
          <CalendarDays size={20} />
          <span>排课管理</span>
        </NavLink>
        <NavLink
          to="/organizations"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'
            }`
          }
        >
          <Building2 size={20} />
          <span>机构管理</span>
        </NavLink>
        <NavLink
          to="/org-settlements"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'
            }`
          }
        >
          <Receipt size={20} />
          <span>机构结算</span>
        </NavLink>
        <NavLink
          to="/org-packages"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'
            }`
          }
        >
          <Package size={20} />
          <span>课时包</span>
        </NavLink>
        <NavLink
          to="/textbooks"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'
            }`
          }
        >
          <Book size={20} />
          <span>教材库</span>
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'
            }`
          }
        >
          <Settings size={20} />
          <span>设置</span>
        </NavLink>
      </nav>
      <div className="p-4 border-t border-gray-200">
        <NavLink
          to="/org-login"
          className="flex items-center justify-center gap-2 px-4 py-2 mb-2 text-sm text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
        >
          <Building2 size={16} />
          <span>机构端入口</span>
        </NavLink>
        <div className="text-xs text-gray-400 text-center">
          © 2024 阳光桥在线英语
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ─── 机构端：独立路由，不经 PasswordProtect/Sidebar ─── */}
        <Route path="/org-login" element={<OrgLogin />} />
        <Route path="/portal/:orgId/*" element={<OrgPortal />} />

        {/* ─── 主 CRM 系统路由 ─── */}
        <Route
          path="/*"
          element={
            <PasswordProtect>
              <div className="flex min-h-screen bg-gray-50">
                <Sidebar />
                <main className="flex-1 overflow-auto">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/students" element={<Students />} />
                    <Route path="/students/:id" element={<StudentDetail />} />
                    <Route path="/payments" element={<Payments />} />
                    <Route path="/classes" element={<Classes />} />
                    <Route path="/teachers" element={<Teachers />} />
                    <Route path="/schedule" element={<Schedule />} />
                    <Route path="/teacher/:teacherId" element={<TeacherPortal />} />
                    <Route path="/teacher/share/:token" element={<TeacherShare />} />
                    <Route path="/organizations" element={<Organizations />} />
                    <Route path="/org-settlements" element={<OrgSettlements />} />
                    <Route path="/org-packages" element={<OrgPackages />} />
                    <Route path="/textbooks" element={<Textbooks />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/parent" element={<ParentView />} />
                    <Route path="/parent/:studentId" element={<ParentView />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
              </div>
            </PasswordProtect>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
