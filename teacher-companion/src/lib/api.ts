import { ClassRecord } from './types';

export const DEFAULT_API_BASE = 'https://api.sunnybridge.qzz.io/api/v1';

export async function fetchTeacherClasses(
  apiBase: string,
  teacherId: number,
  date?: string
): Promise<ClassRecord[]> {
  try {
    let url = `${apiBase || DEFAULT_API_BASE}/classes?teacher_id=${teacherId}`;
    if (date) {
      url += `&date=${date}`;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return data?.data?.data || [];
  } catch (err) {
    console.error('Fetch classes error:', err);
    return [];
  }
}

export async function submitClassFeedback(
  apiBase: string,
  classId: number,
  feedbackData: Partial<ClassRecord>
): Promise<boolean> {
  try {
    const url = `${apiBase || DEFAULT_API_BASE}/classes/${classId}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...feedbackData,
        status: 'completed',
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('Submit feedback error:', err);
    return false;
  }
}
