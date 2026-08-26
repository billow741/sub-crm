import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, Building2, ArrowLeft, Loader2 } from 'lucide-react';
import { setOrgSession, isOrgLoggedIn } from '../store/api';

const API_BASE_URL = 'https://api.changtian.dpdns.org/api/v1';

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">机构管理中心</h1>
          <p className="text-gray-500 mt-2">请输入机构代码和密码登录</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">机构代码</label>
            <input
              type="text"
              required
              value={loginCode}
              onChange={(e) => setLoginCode(e.target.value)}
              placeholder="如：sunnybridge"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50 rounded-lg py-2">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-white py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> 登录中...
              </>
            ) : (
              <>
                <Lock className="w-5 h-5" /> 进入管理
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> 返回超级管理端
          </button>
        </div>
      </div>
    </div>
  );
}
