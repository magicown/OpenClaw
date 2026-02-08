import { useState, useEffect, useCallback } from 'react';
import { postsApi, commentsApi, aiApi, uploadApi, authApi, type Post, type Comment, type Attachment, type User } from './lib/api';
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
  Search, Plus, FileText, Eye, MessageSquare, ArrowLeft, Send,
  Image as ImageIcon, Video, File, Trash2, Paperclip, Bot, X,
  LogOut, User as UserIcon, Lock
} from 'lucide-react';

type View = 'login' | 'list' | 'detail' | 'create' | 'edit';

function App() {
  // 인증 상태
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [view, setView] = useState<View>('list');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'post' | 'comment'; id: number } | null>(null);

  // 게시글 작성/수정 폼
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formAuthorName, setFormAuthorName] = useState('');
  const [formAuthorEmail, setFormAuthorEmail] = useState('');
  const [formAutoAI, setFormAutoAI] = useState(false);
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [formUploaded, setFormUploaded] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 댓글 폼
  const [commentContent, setCommentContent] = useState('');
  const [commentAuthorName, setCommentAuthorName] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // AI 답변
  const [aiGenerating, setAiGenerating] = useState(false);

  // 앱 시작 시 로그인 상태 확인
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const result = await authApi.check();
        if (result.logged_in && result.user) {
          setCurrentUser(result.user);
        } else {
          setView('login');
        }
      } catch {
        setView('login');
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
      setCurrentUser(result.user);
      setLoginUsername('');
      setLoginPassword('');
      setView('list');
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
      setView('login');
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await postsApi.list({
        page,
        limit: 10,
        search: searchTerm || undefined,
      });
      setPosts(response.data);
      setTotalPages(response.pagination.totalPages);
    } catch (error) {
      console.error('Failed to load posts:', error);
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm]);

  useEffect(() => {
    if (view === 'list') {
      loadPosts();
    }
  }, [view, loadPosts]);

  const loadPostDetail = async (id: number) => {
    try {
      setLoading(true);
      const post = await postsApi.get(id);
      setSelectedPost(post);
      setComments(post.comments || []);
      setView('detail');
    } catch (error) {
      console.error('Failed to load post:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadPosts();
  };

  const openCreateForm = () => {
    setFormTitle('');
    setFormContent('');
    setFormAuthorName('');
    setFormAuthorEmail('');
    setFormAutoAI(false);
    setFormFiles([]);
    setFormUploaded([]);
    setView('create');
  };

  const openEditForm = () => {
    if (!selectedPost) return;
    setFormTitle(selectedPost.title);
    setFormContent(selectedPost.content);
    setFormAuthorName(selectedPost.author_name);
    setFormAuthorEmail(selectedPost.author_email || '');
    setFormFiles([]);
    setFormUploaded(selectedPost.attachments || []);
    setView('edit');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFormFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFormFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim() || !formAuthorName.trim()) return;

    try {
      setSubmitting(true);

      // 파일 업로드
      const attachments = [];
      for (const file of formFiles) {
        const result = await uploadApi.upload(file);
        attachments.push(result.file);
      }

      await postsApi.create({
        title: formTitle,
        content: formContent,
        author_name: formAuthorName,
        author_email: formAuthorEmail || undefined,
        attachments,
        auto_ai_answer: formAutoAI,
      });

      setView('list');
    } catch (error) {
      console.error('Failed to create post:', error);
      alert('게시글 작성에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPost || !formTitle.trim() || !formContent.trim() || !formAuthorName.trim()) return;

    try {
      setSubmitting(true);

      // 새 파일 업로드
      const newAttachments = [];
      for (const file of formFiles) {
        const result = await uploadApi.upload(file);
        newAttachments.push(result.file);
      }

      // 삭제된 첨부파일 확인
      const existingIds = formUploaded.map(a => a.id);
      const originalIds = (selectedPost.attachments || []).map(a => a.id);
      const deletedAttachments = originalIds.filter(id => !existingIds.includes(id));

      await postsApi.update(selectedPost.id, {
        title: formTitle,
        content: formContent,
        author_name: formAuthorName,
        author_email: formAuthorEmail || undefined,
        deleted_attachments: deletedAttachments,
        new_attachments: newAttachments,
      } as any);

      await loadPostDetail(selectedPost.id);
    } catch (error) {
      console.error('Failed to update post:', error);
      alert('게시글 수정에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePost = async () => {
    if (!deleteTarget || deleteTarget.type !== 'post') return;
    try {
      await postsApi.delete(deleteTarget.id);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      setView('list');
    } catch (error) {
      console.error('Failed to delete post:', error);
    }
  };

  const handleDeleteComment = async () => {
    if (!deleteTarget || deleteTarget.type !== 'comment' || !selectedPost) return;
    try {
      await commentsApi.delete(deleteTarget.id);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      // 댓글 목록 새로고침
      const updated = await commentsApi.list(selectedPost.id);
      setComments(updated);
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  };

  const handleCreateComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPost || !commentContent.trim() || !commentAuthorName.trim()) return;

    try {
      setCommentSubmitting(true);
      await commentsApi.create({
        post_id: selectedPost.id,
        content: commentContent,
        author_name: commentAuthorName,
      });
      setCommentContent('');
      // 댓글 목록 새로고침
      const updated = await commentsApi.list(selectedPost.id);
      setComments(updated);
    } catch (error) {
      console.error('Failed to create comment:', error);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleAIAnswer = async () => {
    if (!selectedPost) return;
    try {
      setAiGenerating(true);
      await aiApi.generate({
        post_id: selectedPost.id,
        question: selectedPost.content,
      });
      // 댓글 목록 새로고침
      const updated = await commentsApi.list(selectedPost.id);
      setComments(updated);
      // 게시글 상태 새로고침
      const updatedPost = await postsApi.get(selectedPost.id);
      setSelectedPost(updatedPost);
    } catch (error) {
      console.error('Failed to generate AI answer:', error);
      alert('AI 답변 생성에 실패했습니다.');
    } finally {
      setAiGenerating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      pending: { text: '대기 중', variant: 'secondary' },
      answered: { text: '답변 완료', variant: 'default' },
      closed: { text: '종료', variant: 'destructive' },
    };
    const { text, variant } = variants[status] || variants.pending;
    return <Badge variant={variant}>{text}</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'image': return <ImageIcon className="h-4 w-4" />;
      case 'video': return <Video className="h-4 w-4" />;
      default: return <File className="h-4 w-4" />;
    }
  };

  // 인증 확인 중
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-gray-600">로딩 중...</div>
      </div>
    );
  }

  // 로그인 화면
  if (view === 'login' || !currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
              <Lock className="h-7 w-7 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">Q&A 게시판</CardTitle>
            <CardDescription>계정에 로그인하세요</CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              {loginError && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                  {loginError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="login_username">아이디</Label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    id="login_username"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="아이디를 입력하세요"
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="login_password">비밀번호</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    id="login_password"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="비밀번호를 입력하세요"
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={loginLoading}>
                {loginLoading ? '로그인 중...' : '로그인'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  // 게시글 작성/수정 폼
  if (view === 'create' || view === 'edit') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={() => setView(view === 'edit' ? 'detail' : 'list')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-2xl font-bold text-gray-900">
                  {view === 'create' ? '새 질문 작성' : '질문 수정'}
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 flex items-center gap-1">
                  <UserIcon className="h-4 w-4" />
                  {currentUser.display_name}
                </span>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <form onSubmit={view === 'create' ? handleCreatePost : handleUpdatePost}>
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="author_name">작성자 이름 *</Label>
                  <Input
                    id="author_name"
                    value={formAuthorName}
                    onChange={(e) => setFormAuthorName(e.target.value)}
                    placeholder="이름을 입력하세요"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="author_email">이메일 (선택)</Label>
                  <Input
                    id="author_email"
                    type="email"
                    value={formAuthorEmail}
                    onChange={(e) => setFormAuthorEmail(e.target.value)}
                    placeholder="이메일을 입력하세요"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">제목 *</Label>
                  <Input
                    id="title"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="질문 제목을 입력하세요"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">내용 *</Label>
                  <Textarea
                    id="content"
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder="질문 내용을 상세히 작성해주세요"
                    rows={8}
                    required
                  />
                </div>

                {/* 기존 첨부파일 (수정 시) */}
                {view === 'edit' && formUploaded.length > 0 && (
                  <div className="space-y-2">
                    <Label>기존 첨부파일</Label>
                    <div className="space-y-2">
                      {formUploaded.map((attachment) => (
                        <div key={attachment.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                          <div className="flex items-center gap-2 text-sm">
                            {getFileIcon(attachment.file_type)}
                            <span>{attachment.file_name}</span>
                            <span className="text-gray-400">({formatFileSize(attachment.file_size)})</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setFormUploaded(prev => prev.filter(a => a.id !== attachment.id))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 파일 첨부 */}
                <div className="space-y-2">
                  <Label>파일 첨부</Label>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer">
                      <Input
                        type="file"
                        className="hidden"
                        onChange={handleFileChange}
                        accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.pdf,.doc,.docx"
                        multiple
                      />
                      <div className="flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-gray-50 text-sm">
                        <Paperclip className="h-4 w-4" />
                        파일 선택
                      </div>
                    </label>
                    <span className="text-sm text-gray-500">최대 10MB (이미지, 동영상, 문서)</span>
                  </div>
                  {formFiles.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {formFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-blue-50 rounded-md">
                          <div className="flex items-center gap-2 text-sm">
                            <Paperclip className="h-4 w-4 text-blue-500" />
                            <span>{file.name}</span>
                            <span className="text-gray-400">({formatFileSize(file.size)})</span>
                          </div>
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeFile(index)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* AI 자동 답변 (작성 시만) */}
                {view === 'create' && (
                  <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg">
                    <input
                      type="checkbox"
                      id="auto_ai"
                      checked={formAutoAI}
                      onChange={(e) => setFormAutoAI(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="auto_ai" className="flex items-center gap-2 cursor-pointer">
                      <Bot className="h-4 w-4 text-purple-600" />
                      AI 자동 답변 생성
                    </Label>
                    <span className="text-sm text-gray-500">게시글 작성 시 AI가 자동으로 답변을 생성합니다</span>
                  </div>
                )}
              </CardContent>

              <CardFooter className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setView(view === 'edit' ? 'detail' : 'list')}
                >
                  취소
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? '저장 중...' : (view === 'create' ? '질문 등록' : '수정 완료')}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  // 게시글 상세보기
  if (view === 'detail' && selectedPost) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={() => setView('list')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-2xl font-bold text-gray-900">질문 상세</h1>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 flex items-center gap-1">
                  <UserIcon className="h-4 w-4" />
                  {currentUser.display_name}
                </span>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* 게시글 */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-2xl mb-3 flex items-center gap-3">
                    {selectedPost.title}
                    {getStatusBadge(selectedPost.status)}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-4 text-sm">
                    <span>{selectedPost.author_name}</span>
                    <span>|</span>
                    <span>{formatDate(selectedPost.created_at)}</span>
                    <span>|</span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {selectedPost.view_count}
                    </span>
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={openEditForm}>
                    수정
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => { setDeleteTarget({ type: 'post', id: selectedPost.id }); setDeleteDialogOpen(true); }}
                  >
                    삭제
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                {selectedPost.content}
              </div>

              {/* 첨부파일 */}
              {selectedPost.attachments && selectedPost.attachments.length > 0 && (
                <div className="mt-6 pt-4 border-t">
                  <h4 className="text-sm font-medium text-gray-500 mb-3">첨부파일</h4>
                  <div className="space-y-2">
                    {selectedPost.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={`/uploads/${attachment.file_path.split('/').pop()}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 bg-gray-50 rounded-md hover:bg-gray-100 text-sm"
                      >
                        {getFileIcon(attachment.file_type)}
                        <span className="text-blue-600 hover:underline">{attachment.file_name}</span>
                        <span className="text-gray-400">({formatFileSize(attachment.file_size)})</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI 답변 생성 버튼 */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={handleAIAnswer}
              disabled={aiGenerating}
              className="flex items-center gap-2"
            >
              <Bot className="h-4 w-4" />
              {aiGenerating ? 'AI 답변 생성 중...' : 'AI 답변 요청'}
            </Button>
          </div>

          {/* 댓글/답변 목록 */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              답변 ({comments.length})
            </h3>

            {comments.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  아직 답변이 없습니다. 첫 번째 답변을 작성해보세요!
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <Card key={comment.id} className={comment.is_ai_answer ? 'border-purple-200 bg-purple-50/50' : ''}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {comment.author_name}
                          </span>
                          {comment.is_ai_answer && (
                            <Badge variant="outline" className="text-purple-600 border-purple-300">
                              <Bot className="h-3 w-3 mr-1" />
                              AI
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
                      <p className="whitespace-pre-wrap text-gray-700 text-sm leading-relaxed">
                        {comment.content}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* 댓글 작성 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">답변 작성</CardTitle>
            </CardHeader>
            <form onSubmit={handleCreateComment}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="comment_author">작성자 이름</Label>
                  <Input
                    id="comment_author"
                    value={commentAuthorName}
                    onChange={(e) => setCommentAuthorName(e.target.value)}
                    placeholder="이름을 입력하세요"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comment_content">답변 내용</Label>
                  <Textarea
                    id="comment_content"
                    value={commentContent}
                    onChange={(e) => setCommentContent(e.target.value)}
                    placeholder="답변을 작성해주세요"
                    rows={4}
                    required
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button type="submit" disabled={commentSubmitting} className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  {commentSubmitting ? '등록 중...' : '답변 등록'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>

        {/* 삭제 확인 다이얼로그 */}
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
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                취소
              </Button>
              <Button
                variant="destructive"
                onClick={deleteTarget?.type === 'post' ? handleDeletePost : handleDeleteComment}
              >
                삭제
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // 게시글 목록
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Q&A 게시판</h1>
              <p className="text-gray-600 mt-1">질문하고 답변을 받아보세요</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <UserIcon className="h-4 w-4" />
                <span>{currentUser.display_name}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="flex items-center gap-1">
                <LogOut className="h-4 w-4" />
                로그아웃
              </Button>
              <Button className="flex items-center gap-2" onClick={openCreateForm}>
                <Plus className="h-4 w-4" />
                새 질문
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Search */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder="질문 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit">검색</Button>
        </form>
      </div>

      {/* Posts List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="text-gray-600">로딩 중...</div>
          </div>
        ) : posts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">아직 질문이 없습니다</h3>
              <p className="text-gray-600">첫 번째 질문을 작성해보세요!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <Card
                key={post.id}
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => loadPostDetail(post.id)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2 flex items-center gap-3">
                        {post.title}
                        {getStatusBadge(post.status)}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4 text-sm">
                        <span>{post.author_name}</span>
                        <span>|</span>
                        <span>{formatDate(post.created_at)}</span>
                        <span>|</span>
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {post.view_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {post.comment_count}
                        </span>
                        {post.attachment_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Paperclip className="h-3 w-3" />
                            {post.attachment_count}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 line-clamp-2">{post.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              이전
            </Button>
            <span className="flex items-center px-4">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              disabled={page === totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              다음
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
