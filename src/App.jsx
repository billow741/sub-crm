import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import PasswordProtect from './components/PasswordProtect';
import { LayoutDashboard, Users, CreditCard, Settings, Calendar, GraduationCap, CalendarDays, Building2, Receipt, Package, Book, Menu, X } from 'lucide-react';

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

function Sidebar({ isOpen, setIsOpen }) {
  const location = useLocation();

  // Close sidebar on route change on mobile
  useEffect(() => {
    setIsOpen(false);
  }, [location, setIsOpen]);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-gray-800/50 z-20 md:hidden transition-opacity" 
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar container */}
      <div 
        className={`fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200 z-30 flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/sunblogo.webp" alt="SunnyBridge" className="w-10 h-10 object-contain flex-shrink-0" />
            <div>
              <h1 className="text-lg font-bold text-primary-600 leading-tight">SunnyBridge</h1>
              <p className="text-xs text-gray-500">阳光桥少儿英语 CRM</p>
            </div>
          </div>
          <button 
            className="md:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            onClick={() => setIsOpen(false)}
            aria-label="关闭菜单"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavLink to="/" end className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none ${isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}>
            <LayoutDashboard size={20} aria-hidden="true" /><span>仪表盘</span>
          </NavLink>
          <NavLink to="/students" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none ${isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}>
            <Users size={20} aria-hidden="true" /><span>学生管理</span>
          </NavLink>
          <NavLink to="/payments" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none ${isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}>
            <CreditCard size={20} aria-hidden="true" /><span>收款记录</span>
          </NavLink>
          <NavLink to="/classes" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none ${isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}>
            <Calendar size={20} aria-hidden="true" /><span>上课记录</span>
          </NavLink>
          <NavLink to="/teachers" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none ${isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}>
            <GraduationCap size={20} aria-hidden="true" /><span>教师管理</span>
          </NavLink>
          <NavLink to="/schedule" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none ${isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}>
            <CalendarDays size={20} aria-hidden="true" /><span>排课管理</span>
          </NavLink>
          <NavLink to="/organizations" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none ${isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}>
            <Building2 size={20} aria-hidden="true" /><span>机构管理</span>
          </NavLink>
          <NavLink to="/org-settlements" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none ${isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}>
            <Receipt size={20} aria-hidden="true" /><span>机构结算</span>
          </NavLink>
          <NavLink to="/org-packages" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none ${isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}>
            <Package size={20} aria-hidden="true" /><span>课时包</span>
          </NavLink>
          <NavLink to="/textbooks" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none ${isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}>
            <Book size={20} aria-hidden="true" /><span>教材库</span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none ${isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}>
            <Settings size={20} aria-hidden="true" /><span>设置</span>
          </NavLink>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <NavLink to="/org-login" className="flex items-center justify-center gap-2 px-4 py-2 mb-2 text-sm text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none">
            <Building2 size={16} aria-hidden="true" />
            <span>机构端入口</span>
          </NavLink>
          <div className="text-xs text-gray-400 text-center">
            © 2024 阳光桥在线英语
          </div>
        </div>
      </div>
    </>
  );
}

function MainLayout({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      
      <div className="flex-1 flex flex-col w-full md:ml-64 min-h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between h-16 px-4 bg-white border-b border-gray-200 shrink-0 z-10 shadow-sm">
          <div className="flex items-center gap-2">
            <img src="/sunblogo.webp" alt="SunnyBridge" className="w-8 h-8 object-contain" />
            <span className="font-bold text-primary-600 text-lg">SunnyBridge</span>
          </div>
          <button 
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="打开菜单"
          >
            <Menu size={24} aria-hidden="true" />
          </button>
        </header>
        
        <main className="flex-1 overflow-auto">
          {children}
        </main>
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
              <MainLayout>
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
              </MainLayout>
            </PasswordProtect>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
