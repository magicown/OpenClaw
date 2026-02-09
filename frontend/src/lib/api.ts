const API_BASE_URL = '/api';

export interface Post {
  id: number;
  title: string;
  content: string;
  user_id: number;
  category: '긴급' | '오류' | '건의' | '추가개발' | '기타';
  user_display_name?: string;
  user_site?: string;
  status: 'registered' | 'ai_review' | 'pending_approval' | 'ai_processing' | 'completed' | 'admin_confirm' | 'rework';
  view_count: number;
  created_at: string;
  updated_at: string;
  comment_count: number;
  attachment_count: number;
  comments?: Comment[];
  attachments?: Attachment[];
  process_logs?: ProcessLog[];
}

export interface ProcessLog {
  id: number;
  post_id: number;
  step: 'registered' | 'ai_review' | 'pending_approval' | 'ai_processing' | 'completed' | 'admin_confirm' | 'rework';
  content: string;
  created_by: number | null;
  creator_name: string | null;
  created_at: string;
}

export interface Comment {
  id: number;
  post_id: number;
  content: string;
  author_name: string;
  is_ai_answer: boolean;
  created_at: string;
}

export interface Attachment {
  id: number;
  post_id: number;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  file_type: 'image' | 'video' | 'document';
  created_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// 사용자 인증 정보
export interface User {
  id: number;
  username: string;
  display_name: string;
  role: 'user' | 'admin';
  site: string | null;
}

// 인증 API
export const authApi = {
  // 로그인
  login: async (username: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/login.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '로그인에 실패했습니다.');
    return data as { message: string; user: User };
  },

  // 로그인 상태 확인
  check: async () => {
    const response = await fetch(`${API_BASE_URL}/login.php`);
    if (!response.ok) throw new Error('Failed to check auth status');
    return response.json() as Promise<{ logged_in: boolean; user?: User }>;
  },

  // 로그아웃
  logout: async () => {
    const response = await fetch(`${API_BASE_URL}/login.php`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to logout');
    return response.json();
  },
};

// 게시글 API
export const postsApi = {
  // 게시글 목록 조회
  list: async (params?: { page?: number; limit?: number; status?: string; search?: string; mine?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.mine) queryParams.append('mine', '1');

    const response = await fetch(`${API_BASE_URL}/posts.php?${queryParams.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch posts');
    return response.json() as Promise<PaginatedResponse<Post>>;
  },

  // 게시글 상세 조회
  get: async (id: number) => {
    const response = await fetch(`${API_BASE_URL}/posts.php?id=${id}`);
    if (!response.ok) throw new Error('Failed to fetch post');
    return response.json() as Promise<Post>;
  },

  // 게시글 생성
  create: async (data: {
    title: string;
    content: string;
    category: string;
    attachments?: any[];
  }) => {
    const response = await fetch(`${API_BASE_URL}/posts.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create post');
    return response.json();
  },

  // 게시글 삭제
  delete: async (id: number) => {
    const response = await fetch(`${API_BASE_URL}/posts.php?id=${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete post');
    return response.json();
  },
};

// 댓글 API
export const commentsApi = {
  // 댓글 목록 조회
  list: async (postId: number) => {
    const response = await fetch(`${API_BASE_URL}/comments.php?post_id=${postId}`);
    if (!response.ok) throw new Error('Failed to fetch comments');
    return response.json() as Promise<Comment[]>;
  },

  // 댓글 생성 (관리자만)
  create: async (data: {
    post_id: number;
    content: string;
    is_ai_answer?: boolean;
  }) => {
    const response = await fetch(`${API_BASE_URL}/comments.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create comment');
    return response.json();
  },

  // 댓글 삭제 (관리자만)
  delete: async (id: number) => {
    const response = await fetch(`${API_BASE_URL}/comments.php?id=${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete comment');
    return response.json();
  },
};

// 관리자 API
export const adminApi = {
  users: {
    list: async () => {
      const response = await fetch(`${API_BASE_URL}/admin/users.php`);
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    },
    create: async (data: { username: string; password: string; display_name: string; role?: string; site?: string }) => {
      const response = await fetch(`${API_BASE_URL}/admin/users.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create user');
      return response.json();
    },
    update: async (id: number, data: { display_name?: string; password?: string; role?: string; site?: string }) => {
      const response = await fetch(`${API_BASE_URL}/admin/users.php?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update user');
      return response.json();
    },
    delete: async (id: number) => {
      const response = await fetch(`${API_BASE_URL}/admin/users.php?id=${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete user');
      return response.json();
    },
  },
};

// 처리절차 API
export const processApi = {
  // 특정 게시글의 프로세스 로그 조회
  getLogs: async (postId: number) => {
    const response = await fetch(`${API_BASE_URL}/process.php?post_id=${postId}`);
    if (!response.ok) throw new Error('Failed to fetch process logs');
    return response.json() as Promise<ProcessLog[]>;
  },

  // 전체 처리절차 대시보드 (관리자)
  dashboard: async (params?: { step?: string; category?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.step) queryParams.append('step', params.step);
    if (params?.category) queryParams.append('category', params.category);

    const response = await fetch(`${API_BASE_URL}/process.php?${queryParams.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch process dashboard');
    return response.json();
  },

  // 상태 전이 (관리자)
  transition: async (data: { post_id: number; step: string; content?: string }) => {
    const response = await fetch(`${API_BASE_URL}/process.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to transition process');
    return response.json();
  },
};

// 파일 업로드 API
export const uploadApi = {
  // 파일 업로드
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/upload.php`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error('Failed to upload file');
    return response.json() as Promise<{ message: string; file: Attachment }>;
  },
};
