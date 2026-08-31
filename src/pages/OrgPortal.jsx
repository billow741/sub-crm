import { useState, useEffect } from 'react';
import { useParams, useNavigate, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Building2, Users, Calendar, Clock, LogOut, ExternalLink, ShieldAlert } from 'lucide-react';
import { getOrgSession, clearOrgSession, setSelectedOrg } from '../store/api';
import Students from './Students';
import Schedule from './Schedule';
import Classes from './Classes';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

// Wrapper：锁定机构 ID
function withOrgLock(WrappedComponent) {
  return function OrgWrapped(props) {
    const { orgId } = useParams();
    useEffect(() => {
      setSelectedOrg(orgId);
    }, [orgId]);

    return <WrappedComponent {...props} forceOrgId={orgId} />;
  };
}

const OrgStudents = withOrgLock(Students);
const OrgSchedule = withOrgLock(Schedule);
const OrgClasses = withOrgLock(Classes);

export default function OrgPortal() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(getOrgSession());

  // 检查登录状态
  useEffect(() => {
    const s = getOrgSession();
    if (!s.token || String(s.orgId) !== String(orgId)) {
      navigate('/org-login');
    } else {
      setSession(s);
      // 锁定本机构数据
      setSelectedOrg(String(orgId));
    }
  }, [orgId]);

  const handleLogout = () => {
    clearOrgSession();
    navigate('/org-login');
  };

  if (!session.token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="animate-pulse text-primary-500 font-bold flex items-center gap-2">
          <ShieldAlert className="w-5 h-5" /> 验证会话中...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans selection:bg-primary-200 selection:text-primary-900">
      {/* 侧边栏 */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10 relative">
        <div className="p-6 border-b border-gray-100 bg-gradient-to-b from-gray-50/50 to-white relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary-400 to-indigo-500"></div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl flex items-center justify-center shadow-inner border border-primary-200/50">
              <Building2 className="w-5 h-5 text-primary-600" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-gray-900 text-sm truncate" title={session.orgName}>{session.orgName}</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-success-500"></span>
                <span className="text-xs text-gray-500 font-medium">B2B 机构管理端</span>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1.5">
          <NavLink
            to={`/portal/${orgId}/students`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
                isActive 
                  ? 'bg-primary-50 text-primary-700 shadow-sm ring-1 ring-primary-500/20' 
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Users className={isActive ? 'text-primary-600' : 'text-gray-400'} size={20} />
                <span>生源与课时</span>
              </>
            )}
          </NavLink>
          
          <NavLink
            to={`/portal/${orgId}/schedule`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
                isActive 
                  ? 'bg-primary-50 text-primary-700 shadow-sm ring-1 ring-primary-500/20' 
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Calendar className={isActive ? 'text-primary-600' : 'text-gray-400'} size={20} />
                <span>课表与排课</span>
              </>
            )}
          </NavLink>
          
          <NavLink
            to={`/portal/${orgId}/classes`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
                isActive 
                  ? 'bg-primary-50 text-primary-700 shadow-sm ring-1 ring-primary-500/20' 
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Clock className={isActive ? 'text-primary-600' : 'text-gray-400'} size={20} />
                <span>上课记录</span>
              </>
            )}
          </NavLink>
        </nav>

        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full text-gray-500 hover:text-danger-600 hover:bg-danger-50 h-10"
          >
            <LogOut size={16} className="mr-2" />
            安全退出
          </Button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50/30">
        <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <Card className="min-h-full border-0 shadow-sm bg-white/80 backdrop-blur-sm">
            <Routes>
              <Route path="/" element={<Navigate to={`/portal/${orgId}/students`} replace />} />
              <Route path="/students" element={<OrgStudents />} />
              <Route path="/schedule" element={<OrgSchedule />} />
              <Route path="/classes" element={<OrgClasses />} />
            </Routes>
          </Card>
        </div>
      </div>
    </div>
  );
}
