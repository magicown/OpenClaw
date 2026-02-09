import { useState, useEffect } from 'react';
import { authApi, type User } from './lib/api';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './components/ui/card';
import { Label } from './components/ui/label';
import { Lock, Shield } from 'lucide-react';
import AdminApp from './AdminApp';

export default function AdminEntry() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const result = await authApi.check();
        if (result.logged_in && result.user && result.user.role === 'admin') {
          setCurrentUser(result.user);
        }
      } catch {
        // not logged in
      } finally {
        setAuthChecked(true);
      }
    };
    checkAuth();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword.trim()) return;

    try {
      setLoginLoading(true);
      setLoginError('');
      const result = await authApi.login(loginUsername, loginPassword);

      if (result.user.role !== 'admin') {
        await authApi.logout();
        setLoginError('관리자 계정만 접속할 수 있습니다.');
        return;
      }

      setCurrentUser(result.user);
      setLoginUsername('');
      setLoginPassword('');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : '로그인에 실패했습니다.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
      setCurrentUser(null);
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-slate-100 flex items-center justify-center">
        <div className="text-gray-600">로딩 중...</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100">
              <Shield className="h-7 w-7 text-indigo-600" />
            </div>
            <CardTitle className="text-2xl">Q&A 관리자</CardTitle>
            <CardDescription>관리자 계정으로 로그인하세요</CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              {loginError && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                  {loginError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="admin_username">아이디</Label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    id="admin_username"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="관리자 아이디"
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin_password">비밀번호</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    id="admin_password"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="비밀번호"
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={loginLoading}>
                {loginLoading ? '로그인 중...' : '관리자 로그인'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return <AdminApp currentUser={currentUser} onLogout={handleLogout} />;
}
