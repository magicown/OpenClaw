import { useState, useEffect, useCallback } from 'react';
import { postsApi, uploadApi, type Post, type Comment, type User, type ProcessLog } from './lib/api';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Label } from './components/ui/label';
import {
  Search, Plus, FileText, Eye, MessageSquare, ArrowLeft,
  Image as ImageIcon, Video, File, Paperclip, Bot, X,
  LogOut, User as UserIcon, CheckCircle, Clock, AlertTriangle, Activity
} from 'lucide-react';

type View = 'list' | 'detail' | 'create';

interface UserAppProps {
  currentUser: User;
  onLogout: () => void;
}

function UserApp({ currentUser, onLogout }: UserAppProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [view, setView] = useState<View>('list');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);

  // 게시글 작성 폼
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState<string>('기타');
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await postsApi.list({
        page,
        limit: 10,
        search: searchTerm || undefined,
        mine: true,
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
    setFormCategory('기타');
    setFormFiles([]);
    setView('create');
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
    if (!formTitle.trim() || !formContent.trim() || !formCategory) return;

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
        category: formCategory,
        attachments,
      });

      setView('list');
    } catch (error) {
      console.error('Failed to create post:', error);
      alert('게시글 작성에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { text: string; className: string }> = {
      registered: { text: '문의 등록', className: 'bg-blue-100 text-blue-700 border-blue-300' },
      ai_review: { text: '확인 중', className: 'bg-purple-100 text-purple-700 border-purple-300' },
      pending_approval: { text: '승인 대기', className: 'bg-amber-100 text-amber-700 border-amber-300' },
      ai_processing: { text: '작업 중', className: 'bg-cyan-100 text-cyan-700 border-cyan-300' },
      completed: { text: '완료', className: 'bg-green-100 text-green-700 border-green-300' },
      admin_confirm: { text: '승인 대기', className: 'bg-amber-100 text-amber-700 border-amber-300' },
      rework: { text: '작업 중', className: 'bg-cyan-100 text-cyan-700 border-cyan-300' },
      // Legacy statuses for backward compatibility
      pending: { text: '대기 중', className: 'bg-gray-100 text-gray-700 border-gray-300' },
      answered: { text: '답변 완료', className: 'bg-green-100 text-green-700 border-green-300' },
      closed: { text: '종료', className: 'bg-red-100 text-red-700 border-red-300' },
    };
    const { text, className } = statusMap[status] || statusMap.registered;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${className}`}>
        {text}
      </span>
    );
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      '긴급': 'bg-red-100 text-red-700 border-red-300',
      '오류': 'bg-orange-100 text-orange-700 border-orange-300',
      '건의': 'bg-blue-100 text-blue-700 border-blue-300',
      '추가개발': 'bg-green-100 text-green-700 border-green-300',
      '기타': 'bg-gray-100 text-gray-700 border-gray-300',
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[category] || colors['기타']}`}>
        {category}
      </span>
    );
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

  // 처리 단계 진행 표시 컴포넌트
  const MAIN_STEPS = ['registered', 'ai_review', 'ai_processing', 'pending_approval', 'completed'] as const;
  const STEP_LABELS: Record<string, string> = {
    registered: '문의 등록',
    ai_review: '확인 중',
    pending_approval: '승인 대기',
    ai_processing: '작업 중',
    completed: '완료',
    admin_confirm: '승인 대기',
    rework: '재작업',
  };

  const ProcessStepIndicator = ({ status, compact = false }: { status: string; compact?: boolean }) => {
    const isSpecialStatus = status === 'admin_confirm' || status === 'rework';
    const currentMainIndex = MAIN_STEPS.indexOf(status as typeof MAIN_STEPS[number]);

    if (compact) {
      return (
        <div className="flex items-center gap-1 mt-2">
          {isSpecialStatus ? (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              status === 'admin_confirm'
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-red-100 text-red-700'
            }`}>
              {status === 'admin_confirm' ? <AlertTriangle className="h-3 w-3" /> : <Activity className="h-3 w-3" />}
              {STEP_LABELS[status]}
            </span>
          ) : (
            MAIN_STEPS.map((step, index) => {
              const isCompleted = currentMainIndex > index;
              const isCurrent = currentMainIndex === index;
              return (
                <div key={step} className="flex items-center">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      isCompleted
                        ? 'bg-blue-500'
                        : isCurrent
                        ? 'bg-blue-500 ring-2 ring-blue-200 ring-offset-1'
                        : 'bg-gray-300'
                    }`}
                    title={STEP_LABELS[step]}
                  />
                  {index < MAIN_STEPS.length - 1 && (
                    <div className={`w-4 h-0.5 ${isCompleted ? 'bg-blue-500' : 'bg-gray-300'}`} />
                  )}
                </div>
              );
            })
          )}
        </div>
      );
    }

    // Full-size version for detail view
    return (
      <div className="w-full">
        {isSpecialStatus ? (
          <div className="flex items-center justify-center py-3">
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${
              status === 'admin_confirm'
                ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                : 'bg-red-100 text-red-700 border border-red-300'
            }`}>
              {status === 'admin_confirm' ? <AlertTriangle className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
              {STEP_LABELS[status]}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            {MAIN_STEPS.map((step, index) => {
              const isCompleted = currentMainIndex > index;
              const isCurrent = currentMainIndex === index;
              return (
                <div key={step} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                        isCompleted
                          ? 'bg-blue-500 text-white'
                          : isCurrent
                          ? 'bg-blue-500 text-white ring-4 ring-blue-100'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : isCurrent ? (
                        <Clock className="h-4 w-4" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <span className={`mt-1.5 text-xs text-center whitespace-nowrap ${
                      isCompleted || isCurrent ? 'text-blue-600 font-medium' : 'text-gray-400'
                    }`}>
                      {STEP_LABELS[step]}
                    </span>
                  </div>
                  {index < MAIN_STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 mt-[-1rem] ${
                      isCompleted ? 'bg-blue-500' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // 처리 로그 타임라인 컴포넌트
  const ProcessLogsTimeline = ({ logs }: { logs: ProcessLog[] }) => {
    if (!logs || logs.length === 0) return null;
    return (
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-1">
          <Activity className="h-4 w-4" />
          처리 이력
        </h4>
        <div className="relative pl-6 space-y-4">
          <div className="absolute left-2 top-1 bottom-1 w-0.5 bg-gray-200" />
          {logs.map((log) => (
            <div key={log.id} className="relative">
              <div className="absolute -left-4 top-1 w-3 h-3 rounded-full bg-blue-400 border-2 border-white" />
              <div className="text-sm">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-gray-800">{STEP_LABELS[log.step] || log.step}</span>
                  <span className="text-xs text-gray-400">{formatDate(log.created_at)}</span>
                  {log.creator_name && (
                    <span className="text-xs text-gray-400">by {log.creator_name}</span>
                  )}
                </div>
                {log.content && (
                  <p className="text-gray-600 text-xs">{log.content}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 게시글 작성 폼
  if (view === 'create') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={() => setView('list')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-2xl font-bold text-gray-900">새 문의 작성</h1>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 flex items-center gap-1">
                  <UserIcon className="h-4 w-4" />
                  {currentUser.display_name}
                </span>
                <Button variant="ghost" size="sm" onClick={onLogout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <form onSubmit={handleCreatePost}>
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="category">카테고리 *</Label>
                  <select
                    id="category"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    required
                  >
                    <option value="긴급">긴급</option>
                    <option value="오류">오류</option>
                    <option value="건의">건의</option>
                    <option value="추가개발">추가개발</option>
                    <option value="기타">기타</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">제목 *</Label>
                  <Input
                    id="title"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="문의 제목을 입력하세요"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">내용 *</Label>
                  <Textarea
                    id="content"
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder="문의 내용을 상세히 작성해주세요"
                    rows={8}
                    required
                  />
                </div>

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
              </CardContent>

              <CardFooter className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setView('list')}>
                  취소
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? '등록 중...' : '문의 등록'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  // 게시글 상세보기 (읽기 전용)
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
                <h1 className="text-2xl font-bold text-gray-900">문의 상세</h1>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 flex items-center gap-1">
                  <UserIcon className="h-4 w-4" />
                  {currentUser.display_name}
                </span>
                <Button variant="ghost" size="sm" onClick={onLogout}>
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
                    {selectedPost.category && getCategoryBadge(selectedPost.category)}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-4 text-sm">
                    <span>{selectedPost.user_display_name || '알 수 없음'}</span>
                    <span>|</span>
                    <span>{formatDate(selectedPost.created_at)}</span>
                    <span>|</span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {selectedPost.view_count}
                    </span>
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* 처리 단계 진행 표시 */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <ProcessStepIndicator status={selectedPost.status} />
              </div>

              <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                {selectedPost.content}
              </div>

              {/* 첨부파일 - 이미지/비디오 인라인 미리보기 */}
              {selectedPost.attachments && selectedPost.attachments.length > 0 && (
                <div className="mt-6 pt-4 border-t">
                  <h4 className="text-sm font-medium text-gray-500 mb-3">첨부파일</h4>
                  <div className="space-y-4">
                    {selectedPost.attachments.map((attachment) => {
                      const fileUrl = `/uploads/${attachment.file_path.split('/').pop()}`;
                      if (attachment.file_type === 'image') {
                        return (
                          <div key={attachment.id} className="space-y-1">
                            <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                              <img
                                src={fileUrl}
                                alt={attachment.file_name}
                                className="max-w-full rounded-lg border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                              />
                            </a>
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                              {getFileIcon(attachment.file_type)}
                              <span>{attachment.file_name}</span>
                              <span>({formatFileSize(attachment.file_size)})</span>
                            </div>
                          </div>
                        );
                      }
                      if (attachment.file_type === 'video') {
                        return (
                          <div key={attachment.id} className="space-y-1">
                            <video
                              src={fileUrl}
                              controls
                              className="max-w-full rounded-lg border shadow-sm"
                            >
                              브라우저가 비디오 재생을 지원하지 않습니다.
                            </video>
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                              {getFileIcon(attachment.file_type)}
                              <span>{attachment.file_name}</span>
                              <span>({formatFileSize(attachment.file_size)})</span>
                            </div>
                          </div>
                        );
                      }
                      // document type - download link
                      return (
                        <a
                          key={attachment.id}
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 bg-gray-50 rounded-md hover:bg-gray-100 text-sm"
                        >
                          {getFileIcon(attachment.file_type)}
                          <span className="text-blue-600 hover:underline">{attachment.file_name}</span>
                          <span className="text-gray-400">({formatFileSize(attachment.file_size)})</span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 처리 이력 타임라인 */}
              {selectedPost.process_logs && selectedPost.process_logs.length > 0 && (
                <div className="mt-6 pt-4 border-t">
                  <ProcessLogsTimeline logs={selectedPost.process_logs} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* 답변 목록 (읽기 전용) */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              답변 ({comments.length})
            </h3>

            {comments.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  아직 답변이 없습니다. 관리자가 확인 후 답변을 드리겠습니다.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <Card key={comment.id} className={comment.is_ai_answer ? 'border-purple-200 bg-purple-50/50' : ''}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {comment.author_name}
                        </span>
                        {comment.is_ai_answer && (
                          <Badge variant="outline" className="text-purple-600 border-purple-300">
                            <Bot className="h-3 w-3 mr-1" />
                            관리자
                          </Badge>
                        )}
                        <span className="text-xs text-gray-400">{formatDate(comment.created_at)}</span>
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
        </div>
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
              <p className="text-gray-600 mt-1">문의사항을 등록해주세요</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <UserIcon className="h-4 w-4" />
                <span>{currentUser.display_name}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={onLogout} className="flex items-center gap-1">
                <LogOut className="h-4 w-4" />
                로그아웃
              </Button>
              <Button className="flex items-center gap-2" onClick={openCreateForm}>
                <Plus className="h-4 w-4" />
                새 문의
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
              placeholder="문의 검색..."
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
              <h3 className="text-lg font-medium text-gray-900 mb-2">아직 문의가 없습니다</h3>
              <p className="text-gray-600">첫 번째 문의를 등록해보세요!</p>
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
                        {post.category && getCategoryBadge(post.category)}
                        {post.title}
                        {getStatusBadge(post.status)}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4 text-sm">
                        <span>{post.user_display_name || '알 수 없음'}</span>
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
                      <ProcessStepIndicator status={post.status} compact />
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

export default UserApp;
