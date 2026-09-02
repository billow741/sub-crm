export interface ClassRecord {
  id: number;
  student_id: number;
  student_name: string;
  student_grade?: string;
  teacher_id: number;
  teacher_name?: string;
  subject: string;
  date: string;
  start_time: string;
  end_time: string;
  duration?: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'absent';
  textbook_code?: string;
  unit_number?: number;
  page_from?: number;
  page_to?: number;
  fb_vocab?: string;
  fb_patterns?: string;
  fb_grammar?: string;
  fb_teacher_message?: string;
  fb_homework?: string;
  fb_next_preview?: string;
  fb_recording?: string;
  fb_recording_r2_key?: string;
  fb_recording_status?: 'none' | 'pending' | 'ready' | 'failed';
  fb_recording_duration?: number;
  fb_recording_size?: number;
}

export interface DetectedRecording {
  filePath: string;
  fileName: string;
  fileSize: number;
  fileSizeFormatted: string;
  createdTime: string;
  matchedClassId?: number;
  matchedStudentName?: string;
}

export interface AppSettings {
  watchDirectory: string;
  autoStart: boolean;
  preClassReminderMinutes: number;
  autoPromptFeedback: boolean;
  apiBaseUrl: string;
  teacherToken: string;
  teacherId: number;
  teacherName: string;
}
