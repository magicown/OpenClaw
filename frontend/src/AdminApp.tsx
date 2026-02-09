import { useState, useEffect, useCallback } from 'react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Label } from './components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog';
import {
  Search, MessageSquare, Eye, Send, Trash2, Bot,
  LogOut, User as UserIcon, Users, LayoutDashboard,
  Plus, ChevronDown, ArrowLeft, Shield
} from 'lucide-react';

const API_BASE = '/api';

// Types
interface User {
  id: number;
  username: string;
  display_name: string;
  role: 'admin' | 'user';
  site: string | null;
}

interface AdminUser {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  role: 'admin' | 'user';
  site: string | null;
  created_at: string;
}

interface Post {
  id: number;
  user_id: number;
  title: string;
  content: string;
  category: string;
  status: 'pending' | 'answered' | 'closed';
  view_count: number;
  author_name: string;
  created_at: string;
  updated_at: string;
  comment_count: number;
  attachment_count: number;
  comments?: Comment[];
  attachments?: Attachment[];
}

interface Comment {
  id: number;
  post_id: number;
  content: string;
  author_name: string;
  is_ai_answer: boolean;
  created_at: string;
}

interface Attachment {
  id: number;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
}

interface AdminAppProps {
  currentUser: User;
  onLogout: () => void;
}

type Tab = 'board' | 'users';
type BoardView = 'list' | 'detail';

export default function AdminApp({ currentUser, onLogout }: AdminAppProps) {
  const [activeTab, setActiveTab] = useState<Tab>('board');

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-indigo-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-indigo-300" />
              <div>
                <h1 className="text-xl font-bold">Q&A 관리자</h1>
                <p className="text-indigo-300 text-xs">Admin Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-indigo-200 flex items-center gap-1">
                <UserIcon className="h-4 w-4" />
                {currentUser.display_name}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                className="text-indigo-200 hover:text-white hover:bg-indigo-800"
              >
                <LogOut className="h-4 w-4 mr-1" />
                로그아웃
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-indigo-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1">
            <button
              onClick={() => setActiveTab('board')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'board'
                  ? 'border-white text-white'
                  : 'border-transparent text-indigo-300 hover:text-white hover:border-indigo-400'
              }`}
            >
              <LayoutDashboard className="h-4 w-4 inline mr-1.5 -mt-0.5" />
              게시판 관리
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'users'
                  ? 'border-white text-white'
                  : 'border-transparent text-indigo-300 hover:text-white hover:border-indigo-400'
              }`}
            >
              <Users className="h-4 w-4 inline mr-1.5 -mt-0.5" />
              회원 관리
            </button>
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'board' ? (
          <BoardManagement currentUser={currentUser} />
        ) : (
          <UserManagement currentUser={currentUser} />
        )}
      </div>
    </div>
  );
}

// ─── Board Management ─────────────────────────────────────────

function BoardManagement({ currentUser }: { currentUser: User }) {
  const [boardView, setBoardView] = useState<BoardView>('list');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Detail view
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentContent, setCommentContent] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'post' | 'comment'; id: number } | null>(null);

  // Status change
  const [statusChangeOpen, setStatusChangeOpen] = useState(false);

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '10');
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter) params.append('status', statusFilter);
      if (categoryFilter) params.append('category', categoryFilter);

      const res = await fetch(`${API_BASE}/posts.php?${params}`);
      const data = await res.json();
      setPosts(data.data || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err) {
      console.error('Failed to load posts:', err);
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm, statusFilter, categoryFilter]);

  useEffect(() => {
    if (boardView === 'list') loadPosts();
  }, [boardView, loadPosts]);

  const loadPostDetail = async (id: number) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/posts.php?id=${id}`);
      const post = await res.json();
      setSelectedPost(post);
      setComments(post.comments || []);
      setBoardView('detail');
    } catch (err) {
      console.error('Failed to load post:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadPosts();
  };

  const handleDeletePost = async () => {
    if (!deleteTarget || deleteTarget.type !== 'post') return;
    try {
      await fetch(`${API_BASE}/posts.php?id=${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      setBoardView('list');
    } catch (err) {
      console.error('Failed to delete post:', err);
    }
  };

  const handleDeleteComment = async () => {
    if (!deleteTarget || deleteTarget.type !== 'comment' || !selectedPost) return;
    try {
      await fetch(`${API_BASE}/comments.php?id=${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      const res = await fetch(`${API_BASE}/comments.php?post_id=${selectedPost.id}`);
      setComments(await res.json());
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const handleCreateComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPost || !commentContent.trim()) return;

    try {
      setCommentSubmitting(true);
      await fetch(`${API_BASE}/comments.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: selectedPost.id,
          content: commentContent,
          author_name: currentUser.display_name,
        }),
      });
      setCommentContent('');
      const res = await fetch(`${API_BASE}/comments.php?post_id=${selectedPost.id}`);
      setComments(await res.json());
    } catch (err) {
      console.error('Failed to create comment:', err);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedPost) return;
    try {
      await fetch(`${API_BASE}/posts.php?id=${selectedPost.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setSelectedPost({ ...selectedPost, status: newStatus as Post['status'] });
      setStatusChangeOpen(false);
    } catch (err) {
      console.error('Failed to change status:', err);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { text: string; className: string }> = {
      pending: { text: '대기 중', className: 'bg-amber-100 text-amber-800 border-amber-200' },
      answered: { text: '답변 완료', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
      closed: { text: '종료', className: 'bg-slate-100 text-slate-800 border-slate-200' },
    };
    const { text, className } = map[status] || map.pending;
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${className}`}>{text}</span>;
  };

  const getCategoryBadge = (category: string) => {
    const map: Record<string, string> = {
      '긴급': 'bg-red-100 text-red-700 border-red-200',
      '오류': 'bg-orange-100 text-orange-700 border-orange-200',
      '건의': 'bg-blue-100 text-blue-700 border-blue-200',
      '추가개발': 'bg-purple-100 text-purple-700 border-purple-200',
      '기타': 'bg-gray-100 text-gray-700 border-gray-200',
    };
    const cls = map[category] || map['기타'];
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>{category}</span>;
  };

  // ─── Detail View ───
  if (boardView === 'detail' && selectedPost) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setBoardView('list')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            목록으로
          </Button>
        </div>

        {/* Post Card */}
        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {getCategoryBadge(selectedPost.category)}
                  {getStatusBadge(selectedPost.status)}
                </div>
                <CardTitle className="text-xl">{selectedPost.title}</CardTitle>
                <CardDescription className="flex items-center gap-3 text-sm">
                  <span>{(selectedPost as any).user_display_name || selectedPost.author_name || '-'}</span>
                  <span className="text-slate-300">|</span>
                  <span>{formatDate(selectedPost.created_at)}</span>
                  <span className="text-slate-300">|</span>
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{selectedPost.view_count}</span>
                </CardDescription>
              </div>
              <div className="flex gap-2 ml-4">
                {/* Status Change */}
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStatusChangeOpen(!statusChangeOpen)}
                  >
                    상태 변경
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                  {statusChangeOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-white border rounded-md shadow-lg z-10 py-1 min-w-[120px]">
                      {['pending', 'answered', 'closed'].map(s => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(s)}
                          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 ${selectedPost.status === s ? 'font-semibold text-indigo-600' : ''}`}
                        >
                          {s === 'pending' ? '대기 중' : s === 'answered' ? '답변 완료' : '종료'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { setDeleteTarget({ type: 'post', id: selectedPost.id }); setDeleteDialogOpen(true); }}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  삭제
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
              {selectedPost.content}
            </div>
            {selectedPost.attachments && selectedPost.attachments.length > 0 && (
              <div className="mt-6 pt-4 border-t">
                <h4 className="text-sm font-medium text-gray-500 mb-2">첨부파일</h4>
                {selectedPost.attachments.map(a => (
                  <a
                    key={a.id}
                    href={`/uploads/${a.file_path.split('/').pop()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-blue-600 hover:underline mb-1"
                  >
                    {a.file_name} ({(a.file_size / 1024).toFixed(1)}KB)
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Comments */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            답변 ({comments.length})
          </h3>

          {comments.length === 0 ? (
            <Card><CardContent className="py-6 text-center text-gray-500">아직 답변이 없습니다.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {comments.map(comment => (
                <Card key={comment.id} className={comment.is_ai_answer ? 'border-purple-200 bg-purple-50/50' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{comment.author_name}</span>
                        {comment.is_ai_answer && (
                          <Badge variant="outline" className="text-purple-600 border-purple-300">
                            <Bot className="h-3 w-3 mr-1" />AI
                          </Badge>
                        )}
                        <span className="text-xs text-gray-400">{formatDate(comment.created_at)}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setDeleteTarget({ type: 'comment', id: comment.id }); setDeleteDialogOpen(true); }}
                      >
                        <Trash2 className="h-3 w-3 text-gray-400" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-gray-700 text-sm leading-relaxed">{comment.content}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Write Comment (Admin) */}
        <Card className="border-indigo-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-indigo-600" />
              관리자 답변 작성
            </CardTitle>
          </CardHeader>
          <form onSubmit={handleCreateComment}>
            <CardContent className="space-y-3">
              <div className="text-sm text-gray-500">
                작성자: <span className="font-medium text-gray-700">{currentUser.display_name}</span>
              </div>
              <Textarea
                value={commentContent}
                onChange={e => setCommentContent(e.target.value)}
                placeholder="답변을 작성해주세요"
                rows={4}
                required
              />
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button type="submit" disabled={commentSubmitting} className="bg-indigo-600 hover:bg-indigo-700">
                <Send className="h-4 w-4 mr-1" />
                {commentSubmitting ? '등록 중...' : '답변 등록'}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Delete Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>삭제 확인</DialogTitle>
              <DialogDescription>
                {deleteTarget?.type === 'post'
                  ? '이 게시글을 삭제하시겠습니까? 모든 댓글과 첨부파일도 함께 삭제됩니다.'
                  : '이 댓글을 삭제하시겠습니까?'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>취소</Button>
              <Button variant="destructive" onClick={deleteTarget?.type === 'post' ? handleDeletePost : handleDeleteComment}>삭제</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── List View ───
  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="border-slate-200">
        <CardContent className="pt-4 pb-4">
          <form onSubmit={handleSearch} className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="검색어 입력..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              value={categoryFilter}
              onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
              className="h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">전체 카테고리</option>
              <option value="긴급">긴급</option>
              <option value="오류">오류</option>
              <option value="건의">건의</option>
              <option value="추가개발">추가개발</option>
              <option value="기타">기타</option>
            </select>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">전체 상태</option>
              <option value="pending">대기 중</option>
              <option value="answered">답변 완료</option>
              <option value="closed">종료</option>
            </select>
            <Button type="submit">검색</Button>
          </form>
        </CardContent>
      </Card>

      {/* Posts Table */}
      {loading ? (
        <div className="flex justify-center py-12 text-gray-500">로딩 중...</div>
      ) : posts.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-500">게시글이 없습니다.</CardContent></Card>
      ) : (
        <Card className="border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600 w-12">ID</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 w-20">카테고리</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">제목</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 w-24">작성자</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 w-20">상태</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 w-16">조회</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 w-16">댓글</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 w-32">작성일</th>
                </tr>
              </thead>
              <tbody>
                {posts.map(post => (
                  <tr
                    key={post.id}
                    className="border-b hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => loadPostDetail(post.id)}
                  >
                    <td className="px-4 py-3 text-slate-500">{post.id}</td>
                    <td className="px-4 py-3">{getCategoryBadge(post.category)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{post.title}</td>
                    <td className="px-4 py-3 text-slate-600">{(post as any).user_display_name || post.author_name || '-'}</td>
                    <td className="px-4 py-3">{getStatusBadge(post.status)}</td>
                    <td className="px-4 py-3 text-slate-500">{post.view_count}</td>
                    <td className="px-4 py-3 text-slate-500">{post.comment_count}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(post.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>이전</Button>
          <span className="flex items-center px-3 text-sm text-gray-600">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>다음</Button>
        </div>
      )}
    </div>
  );
}

// ─── User Management ──────────────────────────────────────────

function UserManagement({ currentUser }: { currentUser: User }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    display_name: '',
    email: '',
    role: 'user' as 'admin' | 'user',
    site: '',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState<AdminUser | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/users.php`);
      if (!res.ok) throw new Error('Failed to fetch users');
      setUsers(await res.json());
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const openCreateDialog = () => {
    setEditingUser(null);
    setFormData({ username: '', password: '', display_name: '', email: '', role: 'user', site: '' });
    setFormError('');
    setDialogOpen(true);
  };

  const openEditDialog = (user: AdminUser) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      display_name: user.display_name,
      email: user.email || '',
      role: user.role,
      site: user.site || '',
    });
    setFormError('');
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!editingUser && (!formData.username.trim() || !formData.password || !formData.display_name.trim())) {
      setFormError('아이디, 비밀번호, 표시이름은 필수입니다.');
      return;
    }
    if (editingUser && !formData.display_name.trim()) {
      setFormError('표시이름은 필수입니다.');
      return;
    }

    try {
      setSaving(true);

      if (editingUser) {
        // Update
        const body: Record<string, string> = {
          display_name: formData.display_name,
          email: formData.email,
          role: formData.role,
          site: formData.site,
        };
        if (formData.password) body.password = formData.password;

        const res = await fetch(`${API_BASE}/admin/users.php?id=${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '수정 실패');
      } else {
        // Create
        const res = await fetch(`${API_BASE}/admin/users.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '생성 실패');
      }

      setDialogOpen(false);
      loadUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTargetUser) return;
    try {
      const res = await fetch(`${API_BASE}/admin/users.php?id=${deleteTargetUser.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '삭제 실패');
      setDeleteDialogOpen(false);
      setDeleteTargetUser(null);
      loadUsers();
    } catch (err) {
      console.error('Failed to delete user:', err);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">회원 목록</h2>
        <Button onClick={openCreateDialog} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="h-4 w-4 mr-1" />
          회원 추가
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-gray-500">로딩 중...</div>
      ) : (
        <Card className="border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600 w-12">ID</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">아이디</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">표시이름</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 w-20">권한</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 w-24">사이트</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 w-28">가입일</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 w-28">관리</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500">{u.id}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{u.username}</td>
                    <td className="px-4 py-3 text-slate-700">{u.display_name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {u.role === 'admin' ? '관리자' : '유저'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.site || '-'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(u)}>
                          수정
                        </Button>
                        {u.id !== currentUser.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => { setDeleteTargetUser(u); setDeleteDialogOpen(true); }}
                          >
                            삭제
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? '회원 수정' : '회원 추가'}</DialogTitle>
            <DialogDescription>
              {editingUser ? '회원 정보를 수정합니다.' : '새로운 회원을 추가합니다.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave}>
            <div className="space-y-4 py-2">
              {formError && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">{formError}</div>
              )}
              <div className="space-y-2">
                <Label htmlFor="u_username">아이디 *</Label>
                <Input
                  id="u_username"
                  value={formData.username}
                  onChange={e => setFormData(d => ({ ...d, username: e.target.value }))}
                  disabled={!!editingUser}
                  required={!editingUser}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="u_password">
                  비밀번호 {editingUser ? '(변경 시에만 입력)' : '*'}
                </Label>
                <Input
                  id="u_password"
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData(d => ({ ...d, password: e.target.value }))}
                  required={!editingUser}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="u_display_name">표시이름 *</Label>
                <Input
                  id="u_display_name"
                  value={formData.display_name}
                  onChange={e => setFormData(d => ({ ...d, display_name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="u_email">이메일</Label>
                <Input
                  id="u_email"
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData(d => ({ ...d, email: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="u_role">권한 *</Label>
                  <select
                    id="u_role"
                    value={formData.role}
                    onChange={e => setFormData(d => ({ ...d, role: e.target.value as 'admin' | 'user' }))}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="user">유저</option>
                    <option value="admin">관리자</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="u_site">사이트</Label>
                  <select
                    id="u_site"
                    value={formData.site}
                    onChange={e => setFormData(d => ({ ...d, site: e.target.value }))}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">선택안함</option>
                    <option value="맨하탄">맨하탄</option>
                    <option value="간지">간지</option>
                  </select>
                </div>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
              <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
                {saving ? '저장 중...' : (editingUser ? '수정' : '추가')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>회원 삭제</DialogTitle>
            <DialogDescription>
              '{deleteTargetUser?.display_name}' ({deleteTargetUser?.username}) 회원을 삭제하시겠습니까?
              이 작업은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>취소</Button>
            <Button variant="destructive" onClick={handleDelete}>삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
