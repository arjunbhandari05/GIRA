import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import DoctorPortal from './pages/DoctorPortal.jsx';
import PatientView from './pages/PatientView.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DoctorPortal />} />
        <Route path="/patient/:patientId" element={<PatientView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
