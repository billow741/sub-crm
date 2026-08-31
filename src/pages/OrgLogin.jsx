import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, Building2, ArrowLeft, Loader2 } from 'lucide-react';
import { setOrgSession, isOrgLoggedIn, API_BASE_URL } from '../store/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export default function OrgLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loginCode, setLoginCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 已登录 → 直接跳转
  useEffect(() => {
    if (isOrgLoggedIn()) {
      const { orgId } = JSON.parse(localStorage.getItem('org_id') || '""');
      navigate(`/portal/${localStorage.getItem('org_id')}`);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/org/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_code: loginCode.trim(), password }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error?.message || '登录失败');
        setLoading(false);
        return;
      }
      const { token, org_id, name } = data.data;
      setOrgSession(token, org_id, name);
      navigate(`/portal/${org_id}`);
    } catch (err) {
      setError('网络错误，请重试');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 p-4">
      <Card className="max-w-md w-full shadow-2xl border-0 overflow-hidden">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-inner border border-primary-100/50">
              <Building2 className="w-8 h-8 text-primary-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">机构管理中心</h1>
            <p className="text-gray-500 mt-2 text-sm">请输入机构代码和密码登录</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">机构代码</label>
              <input
                type="text"
                required
                value={loginCode}
                onChange={(e) => setLoginCode(e.target.value)}
                placeholder="如：sunnybridge"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all bg-gray-50/50 focus:bg-white"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">密码</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all bg-gray-50/50 focus:bg-white"
              />
            </div>

            {error && (
              <div className="text-danger-600 text-sm text-center bg-danger-50 rounded-lg py-2.5 border border-danger-100">{error}</div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full py-3 h-auto text-base rounded-xl shadow-lg shadow-primary-600/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> 登录中...
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5 mr-2" /> 进入管理
                </>
              )}
            </Button>
          </form>

          <div className="mt-8 text-center pt-6 border-t border-gray-100">
            <button
              onClick={() => navigate('/')}
              className="text-sm text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1.5 mx-auto transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> 返回超级管理端
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
