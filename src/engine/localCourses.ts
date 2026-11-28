import Dexie, { type Table } from 'dexie';
import type { GeneratedCourse } from './generatorSchema';
import type { StageOutputRecord } from './generationHistory';

export interface CustomCourse extends GeneratedCourse {
  id: string; // e.g., 'custom-1698765432'
  createdAt: Date;
}

class LocalCoursesDB extends Dexie {
  courses!: Table<CustomCourse, string>;
  /**
   * S8: per-stage raw output journal, keyed `${lessonId}:${stage}`, so an
   * interrupted or failed generation can resume without re-paying for stages that
   * already succeeded. Cleared when a lesson assembles cleanly.
   */
  stageOutputs!: Table<StageOutputRecord, string>;

  constructor() {
    super('AiAcademyLocalCourses');
    this.version(1).stores({
      courses: 'id, createdAt, title' // Primary key and indexed props
    });
    // v2 adds the stage journal; `courses` keeps its existing definition.
    this.version(2).stores({
      courses: 'id, createdAt, title',
      stageOutputs: 'id, lessonId, savedAt',
    });
  }
}

export const db = new LocalCoursesDB();

export async function saveGeneratedCourse(course: GeneratedCourse): Promise<string> {
  const id = `custom-${Date.now()}`;
  const courseToSave: CustomCourse = {
    ...course,
    id,
    createdAt: new Date(),
  };
  
  await db.courses.put(courseToSave);
  return id;
}

export async function getAllCustomCourses(): Promise<CustomCourse[]> {
  return await db.courses.orderBy('createdAt').reverse().toArray();
}

export async function getCustomCourseById(id: string): Promise<CustomCourse | undefined> {
  return await db.courses.get(id);
}

export async function deleteCustomCourse(id: string): Promise<void> {
  await db.courses.delete(id);
}
