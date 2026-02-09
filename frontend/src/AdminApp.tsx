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
  Plus, ChevronDown, ArrowLeft, Shield,
  ClipboardList, ArrowRight, Clock, CheckCircle2, Activity,
  RotateCcw, Cpu, FileCheck, X
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
  status: string;
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

type Tab = 'process' | 'board' | 'users';
type BoardView = 'list' | 'detail';

// Workflow step types
type WorkflowStep = 'registered' | 'ai_review' | 'pending_approval' | 'ai_processing' | 'completed' | 'admin_confirm' | 'rework';

interface ProcessPost {
  id: number;
  user_id: number;
  title: string;
  content: string;
  category: string;
  status: string;
  current_step: WorkflowStep;
  view_count: number;
  author_name: string;
  user_display_name?: string;
  user_site?: string;
  created_at: string;
  updated_at: string;
  comment_count: number;
  attachment_count: number;
  last_process_log?: string;
  last_log?: string;
  log_count?: number;
  comments?: Comment[];
  attachments?: Attachment[];
}

interface ProcessLog {
  id: number;
  post_id: number;
  step: WorkflowStep;
  content: string;
  created_by: string;
  created_at: string;
}

const STEP_CONFIG: Record<WorkflowStep, { label: string; className: string; icon: React.ReactNode }> = {
  registered: { label: '문의 등록', className: 'bg-blue-100 text-blue-700 border-blue-200', icon: <FileCheck className="h-3 w-3" /> },
  ai_review: { label: 'AI 확인', className: 'bg-purple-100 text-purple-700 border-purple-200', icon: <Cpu className="h-3 w-3" /> },
  pending_approval: { label: '승인 대기', className: 'bg-amber-100 text-amber-700 border-amber-200', icon: <Clock className="h-3 w-3" /> },
  ai_processing: { label: 'AI 작업 중', className: 'bg-cyan-100 text-cyan-700 border-cyan-200', icon: <Activity className="h-3 w-3" /> },
  completed: { label: '완료', className: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="h-3 w-3" /> },
  admin_confirm: { label: '관리자 컨펌', className: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: <Shield className="h-3 w-3" /> },
  rework: { label: '재작업', className: 'bg-red-100 text-red-700 border-red-200', icon: <RotateCcw className="h-3 w-3" /> },
};

const STEP_TRANSITIONS: Record<WorkflowStep, { label: string; next: WorkflowStep }[]> = {
  registered: [{ label: 'AI 확인 시작', next: 'ai_review' }],
  ai_review: [{ label: '승인 요청', next: 'pending_approval' }],
  pending_approval: [{ label: '승인 (AI 작업 시작)', next: 'ai_processing' }],
  ai_processing: [
    { label: '작업 완료', next: 'completed' },
    { label: '관리자 컨펌 필요', next: 'admin_confirm' },
  ],
  completed: [
    { label: '재작업 요청', next: 'rework' },
    { label: '재검토', next: 'admin_confirm' },
  ],
  admin_confirm: [
    { label: '완료 처리', next: 'completed' },
    { label: '재작업 요청', next: 'rework' },
  ],
  rework: [{ label: 'AI 재작업 시작', next: 'ai_processing' }],
};

export default function AdminApp({ currentUser, onLogout }: AdminAppProps) {
  const [activeTab, setActiveTab] = useState<Tab>('process');

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
              onClick={() => setActiveTab('process')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'process'
                  ? 'border-white text-white'
                  : 'border-transparent text-indigo-300 hover:text-white hover:border-indigo-400'
              }`}
            >
              <ClipboardList className="h-4 w-4 inline mr-1.5 -mt-0.5" />
              처리절차
            </button>
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
        {activeTab === 'process' ? (
          <ProcessManagement currentUser={currentUser} />
        ) : activeTab === 'board' ? (
          <BoardManagement currentUser={currentUser} />
        ) : (
          <UserManagement currentUser={currentUser} />
        )}
      </div>
    </div>
  );
}

// ─── Process Management ───────────────────────────────────────

function ProcessManagement({ currentUser }: { currentUser: User }) {
  const [posts, setPosts] = useState<ProcessPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [stepFilter, setStepFilter] = useState<WorkflowStep | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stepCounts, setStepCounts] = useState<Record<WorkflowStep, number>>({
    registered: 0, ai_review: 0, pending_approval: 0, ai_processing: 0,
    completed: 0, admin_confirm: 0, rework: 0,
  });

  // Detail view
  const [selectedPost, setSelectedPost] = useState<ProcessPost | null>(null);
  const [processLogs, setProcessLogs] = useState<ProcessLog[]>([]);
  const [detailComments, setDetailComments] = useState<Comment[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // Transition
  const [transitionContent, setTransitionContent] = useState('');
  const [transitioning, setTransitioning] = useState(false);

  // Comment
  const [commentContent, setCommentContent] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (stepFilter) params.append('step', stepFilter);
      if (categoryFilter) params.append('category', categoryFilter);

      const res = await fetch(`${API_BASE}/process.php?${params}`);
      const data = await res.json();
      const items: ProcessPost[] = data.data || data || [];
      setPosts(items);

      // Compute counts from all posts (unfiltered) or from response
      if (data.counts) {
        setStepCounts(data.counts);
      } else {
        // Compute from loaded data when no filter applied
        if (!stepFilter && !categoryFilter) {
          const counts: Record<string, number> = {};
          for (const step of Object.keys(STEP_CONFIG)) counts[step] = 0;
          items.forEach(p => {
            const step = p.current_step || p.status;
            if (counts[step] !== undefined) counts[step]++;
          });
          setStepCounts(counts as Record<WorkflowStep, number>);
        }
      }
    } catch (err) {
      console.error('Failed to load process posts:', err);
    } finally {
      setLoading(false);
    }
  }, [stepFilter, categoryFilter]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const loadPostDetail = async (post: ProcessPost) => {
    try {
      setDetailLoading(true);
      setSelectedPost(post);
      setShowDetail(true);
      setTransitionContent('');

      // Load process logs
      const logsRes = await fetch(`${API_BASE}/process.php?post_id=${post.id}`);
      const logsData = await logsRes.json();
      setProcessLogs(logsData.logs || logsData || []);

      // Load comments
      const commentsRes = await fetch(`${API_BASE}/comments.php?post_id=${post.id}`);
      const commentsData = await commentsRes.json();
      setDetailComments(Array.isArray(commentsData) ? commentsData : commentsData.data || []);
    } catch (err) {
      console.error('Failed to load post detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleTransition = async (postId: number, nextStep: WorkflowStep) => {
    try {
      setTransitioning(true);
      await fetch(`${API_BASE}/process.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: postId,
          step: nextStep,
          content: transitionContent || undefined,
        }),
      });
      setTransitionContent('');

      // Reload
      await loadPosts();
      if (selectedPost && selectedPost.id === postId) {
        // Reload detail
        const updated = { ...selectedPost, current_step: nextStep, status: nextStep };
        setSelectedPost(updated);
        const logsRes = await fetch(`${API_BASE}/process.php?post_id=${postId}`);
        const logsData = await logsRes.json();
        setProcessLogs(logsData.logs || logsData || []);
      }
    } catch (err) {
      console.error('Failed to transition step:', err);
    } finally {
      setTransitioning(false);
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
      const data = await res.json();
      setDetailComments(Array.isArray(data) ? data : data.data || []);
    } catch (err) {
      console.error('Failed to create comment:', err);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getStepBadge = (step: WorkflowStep) => {
    const cfg = STEP_CONFIG[step];
    if (!cfg) return <span className="text-xs text-gray-500">{step}</span>;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}>
        {cfg.icon}
        {cfg.label}
      </span>
    );
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

  // ─── Detail Modal ───
  if (showDetail && selectedPost) {
    const currentStep = (selectedPost.current_step || selectedPost.status) as WorkflowStep;
    const transitions = STEP_TRANSITIONS[currentStep] || [];

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setShowDetail(false); setSelectedPost(null); }}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            목록으로
          </Button>
          <span className="text-sm text-gray-500">처리절차 상세</span>
        </div>

        {detailLoading ? (
          <div className="flex justify-center py-12 text-gray-500">로딩 중...</div>
        ) : (
          <>
            {/* Post Info */}
            <Card className="border-slate-200">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getCategoryBadge(selectedPost.category)}
                      {getStepBadge(currentStep)}
                    </div>
                    <CardTitle className="text-xl">{selectedPost.title}</CardTitle>
                    <CardDescription className="flex items-center gap-3 text-sm">
                      <span>{selectedPost.user_display_name || selectedPost.author_name || '-'}</span>
                      {selectedPost.user_site && (
                        <>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-500">{selectedPost.user_site}</span>
                        </>
                      )}
                      <span className="text-slate-300">|</span>
                      <span>{formatDate(selectedPost.created_at)}</span>
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                  {selectedPost.content}
                </div>
              </CardContent>
            </Card>

            {/* Process Timeline */}
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-indigo-600" />
                  처리 이력
                </CardTitle>
              </CardHeader>
              <CardContent>
                {processLogs.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">처리 이력이 없습니다.</p>
                ) : (
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />
                    <div className="space-y-4">
                      {processLogs.map((log, idx) => (
                        <div key={log.id || idx} className="relative pl-10">
                          <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full bg-white border-2 border-indigo-400" />
                          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                            <div className="flex items-center gap-2 mb-1">
                              {getStepBadge(log.step)}
                              <span className="text-xs text-gray-400">{formatDate(log.created_at)}</span>
                              <span className="text-xs text-gray-500">by {log.created_by}</span>
                            </div>
                            {log.content && (
                              <p className="text-sm text-gray-700 mt-1">{log.content}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Status Transition Actions */}
            {transitions.length > 0 && (
              <Card className="border-indigo-200 bg-indigo-50/30">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-indigo-600" />
                    단계 전환
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    value={transitionContent}
                    onChange={e => setTransitionContent(e.target.value)}
                    placeholder="메모 입력 (선택사항)"
                    rows={2}
                    className="bg-white"
                  />
                  <div className="flex flex-wrap gap-2">
                    {transitions.map(t => {
                      const nextCfg = STEP_CONFIG[t.next];
                      return (
                        <Button
                          key={t.next}
                          size="sm"
                          disabled={transitioning}
                          onClick={() => handleTransition(selectedPost.id, t.next)}
                          className={`${nextCfg.className} border hover:opacity-80`}
                          variant="outline"
                        >
                          <ArrowRight className="h-3 w-3 mr-1" />
                          {t.label}
                        </Button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Comments */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                답변 ({detailComments.length})
              </h3>

              {detailComments.length === 0 ? (
                <Card><CardContent className="py-6 text-center text-gray-500">아직 답변이 없습니다.</CardContent></Card>
              ) : (
                <div className="space-y-3">
                  {detailComments.map(comment => (
                    <Card key={comment.id} className={comment.is_ai_answer ? 'border-purple-200 bg-purple-50/50' : ''}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{comment.author_name}</span>
                          {comment.is_ai_answer && (
                            <Badge variant="outline" className="text-purple-600 border-purple-300">
                              <Bot className="h-3 w-3 mr-1" />AI
                            </Badge>
                          )}
                          <span className="text-xs text-gray-400">{formatDate(comment.created_at)}</span>
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

            {/* Write Comment */}
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
          </>
        )}
      </div>
    );
  }

  // ─── 메인 플로우 단계 순서 ───
  const MAIN_FLOW: WorkflowStep[] = ['registered', 'ai_review', 'pending_approval', 'ai_processing', 'completed'];

  // 특정 단계가 메인 플로우에서 몇 번째인지 (0-based), 특수 상태는 -1
  const getStepIndex = (step: WorkflowStep) => MAIN_FLOW.indexOf(step);

  // ─── List View ───
  return (
    <div className="space-y-4">
      {/* Dashboard Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {(Object.keys(STEP_CONFIG) as WorkflowStep[]).map(step => {
          const cfg = STEP_CONFIG[step];
          const count = stepCounts[step] || 0;
          const isActive = stepFilter === step;
          return (
            <button
              key={step}
              onClick={() => setStepFilter(isActive ? '' : step)}
              className={`rounded-lg border p-3 text-center transition-all hover:shadow-md ${
                isActive ? 'ring-2 ring-indigo-400 shadow-md' : ''
              } ${cfg.className}`}
            >
              <div className="text-2xl font-bold">{count}</div>
              <div className="text-xs font-medium mt-1 flex items-center justify-center gap-1">
                {cfg.icon}
                {cfg.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="border-slate-200">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <select
              value={stepFilter}
              onChange={e => setStepFilter(e.target.value as WorkflowStep | '')}
              className="h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">전체 단계</option>
              {(Object.keys(STEP_CONFIG) as WorkflowStep[]).map(step => (
                <option key={step} value={step}>{STEP_CONFIG[step].label}</option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">전체 카테고리</option>
              <option value="긴급">긴급</option>
              <option value="오류">오류</option>
              <option value="건의">건의</option>
              <option value="추가개발">추가개발</option>
              <option value="기타">기타</option>
            </select>
            {(stepFilter || categoryFilter) && (
              <Button variant="ghost" size="sm" onClick={() => { setStepFilter(''); setCategoryFilter(''); }}>
                <X className="h-4 w-4 mr-1" />
                필터 초기화
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Process Cards */}
      {loading ? (
        <div className="flex justify-center py-12 text-gray-500">로딩 중...</div>
      ) : posts.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-500">게시글이 없습니다.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {posts.map(post => {
            const currentStep = (post.current_step || post.status) as WorkflowStep;
            const currentIdx = getStepIndex(currentStep);
            const isSpecial = currentStep === 'admin_confirm' || currentStep === 'rework';
            const transitions = STEP_TRANSITIONS[currentStep] || [];

            return (
              <Card key={post.id} className="border-slate-200 hover:shadow-lg transition-shadow">
                <CardContent className="p-4">
                  {/* 상단: 게시글 정보 */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs text-slate-400 font-mono">#{post.id}</span>
                        {getCategoryBadge(post.category)}
                        <button
                          onClick={() => loadPostDetail(post)}
                          className="font-semibold text-slate-800 hover:text-indigo-600 hover:underline text-left truncate"
                        >
                          {post.title}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{post.user_display_name || '-'}</span>
                        {post.user_site && (
                          <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px]">{post.user_site}</span>
                        )}
                        <span className="text-slate-300">|</span>
                        <span>{formatDate(post.created_at)}</span>
                      </div>
                    </div>
                    {/* 액션 버튼 */}
                    <div className="flex gap-1 ml-3 flex-shrink-0">
                      {transitions.map(t => (
                        <Button
                          key={t.next}
                          size="sm"
                          variant="outline"
                          disabled={transitioning}
                          onClick={() => handleTransition(post.id, t.next)}
                          className="text-xs h-7 px-2.5"
                        >
                          <ArrowRight className="h-3 w-3 mr-0.5" />
                          {t.label}
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => loadPostDetail(post)}
                        className="text-xs h-7 px-2 text-slate-500"
                      >
                        상세
                      </Button>
                    </div>
                  </div>

                  {/* 처리 진행 박스 */}
                  <div className="flex items-stretch gap-0 rounded-lg border border-slate-200 overflow-hidden relative">
                    {MAIN_FLOW.map((step, idx) => {
                      const cfg = STEP_CONFIG[step];
                      const isCurrent = step === currentStep;
                      const isPast = !isSpecial && currentIdx > idx;
                      const isSpecialPast = isSpecial && idx <= 3;

                      let bgClass = '';
                      let textClass = '';

                      if (isCurrent) {
                        bgClass = cfg.className.replace(/bg-(\w+)-100/, 'bg-$1-200');
                        textClass = 'font-bold';
                      } else if (isPast || isSpecialPast) {
                        bgClass = cfg.className;
                        textClass = 'font-medium';
                      } else {
                        bgClass = 'bg-slate-50 text-slate-300 border-slate-100';
                        textClass = '';
                      }

                      return (
                        <div
                          key={step}
                          className={`flex-1 flex flex-col items-center justify-center py-3 px-1 relative transition-all duration-300 ${bgClass}`}
                        >
                          {/* 현재 단계 전체 박스 글로우 애니메이션 */}
                          {isCurrent && (
                            <>
                              <div className="absolute inset-0 animate-pulse bg-white/30 z-0" />
                              <div className="absolute inset-x-0 bottom-0 h-1 bg-indigo-500 z-10">
                                <div className="h-full bg-indigo-300 animate-[shimmer_1.5s_ease-in-out_infinite]"
                                  style={{
                                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)',
                                    backgroundSize: '200% 100%',
                                    animation: 'shimmer 1.5s ease-in-out infinite',
                                  }}
                                />
                              </div>
                              <div className="absolute -inset-[1px] rounded-sm border-2 border-indigo-400 animate-pulse z-10 pointer-events-none" />
                            </>
                          )}
                          {/* 아이콘 */}
                          <div className={`mb-1 relative z-20 ${textClass}`}>
                            {isPast || isSpecialPast ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            ) : isCurrent ? (
                              <div className="relative">
                                <div className="h-5 w-5 animate-bounce" style={{ animationDuration: '2s' }}>{cfg.icon}</div>
                                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
                                </span>
                              </div>
                            ) : (
                              <div className="h-5 w-5 rounded-full border-2 border-slate-200" />
                            )}
                          </div>
                          {/* 라벨 */}
                          <span className={`text-[11px] leading-tight text-center relative z-20 ${textClass}`}>
                            {cfg.label}
                          </span>
                          {/* 현재 단계 표시 텍스트 */}
                          {isCurrent && (
                            <span className="text-[9px] text-indigo-600 font-bold mt-0.5 relative z-20 animate-pulse">
                              진행 중
                            </span>
                          )}
                          {/* 화살표 (마지막 제외) */}
                          {idx < MAIN_FLOW.length - 1 && (
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-30">
                              <ArrowRight className={`h-3.5 w-3.5 ${isPast || isSpecialPast ? 'text-emerald-400' : isCurrent ? 'text-indigo-400' : 'text-slate-200'}`} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 특수 상태 표시 (admin_confirm / rework) */}
                  {isSpecial && (
                    <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-md border-2 animate-pulse ${STEP_CONFIG[currentStep].className}`}>
                      <div className="animate-bounce" style={{ animationDuration: '2s' }}>
                        {STEP_CONFIG[currentStep].icon}
                      </div>
                      <span className="text-xs font-bold">{STEP_CONFIG[currentStep].label}</span>
                      <span className="text-[9px] font-bold animate-pulse">진행 중</span>
                      <span className="text-xs opacity-70">- {(post.last_process_log || post.last_log) || '처리 중'}</span>
                    </div>
                  )}

                  {/* 최근 메모 (특수 상태가 아닌 경우) */}
                  {!isSpecial && (post.last_process_log || post.last_log) && (
                    <div className="mt-2 text-xs text-slate-500 truncate">
                      <Clock className="h-3 w-3 inline mr-1" />
                      {(post.last_process_log || post.last_log)}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
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
    const cfg = STEP_CONFIG[status as WorkflowStep];
    if (cfg) {
      return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}>{cfg.icon}{cfg.label}</span>;
    }
    const legacyMap: Record<string, { text: string; className: string }> = {
      pending: { text: '대기 중', className: 'bg-amber-100 text-amber-800 border-amber-200' },
      answered: { text: '답변 완료', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
      closed: { text: '종료', className: 'bg-slate-100 text-slate-800 border-slate-200' },
    };
    const { text, className } = legacyMap[status] || { text: status, className: 'bg-gray-100 text-gray-700 border-gray-200' };
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
                    <div className="absolute right-0 top-full mt-1 bg-white border rounded-md shadow-lg z-10 py-1 min-w-[140px]">
                      {(Object.keys(STEP_CONFIG) as WorkflowStep[]).map(s => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(s)}
                          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-1.5 ${selectedPost.status === s ? 'font-semibold text-indigo-600' : ''}`}
                        >
                          {STEP_CONFIG[s].icon}
                          {STEP_CONFIG[s].label}
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
              {(Object.keys(STEP_CONFIG) as WorkflowStep[]).map(step => (
                <option key={step} value={step}>{STEP_CONFIG[step].label}</option>
              ))}
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
