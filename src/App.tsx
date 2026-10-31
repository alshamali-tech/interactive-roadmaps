import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Home } from '@/pages/Home';
import { Lesson } from '@/pages/Lesson';
import { CourseGenerator } from '@/pages/CourseGenerator';
import { MyCourses } from '@/pages/MyCourses';
import { CustomCourse } from '@/pages/CustomCourse';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/lesson/:lessonId" element={<Lesson />} />
        <Route path="/track/:trackId" element={<Home />} />
        <Route path="/generate" element={<CourseGenerator />} />
        <Route path="/my-courses" element={<MyCourses />} />
        <Route path="/course/:courseId" element={<CustomCourse />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
