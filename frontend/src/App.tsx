import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import RelationshipMapper from './pages/RelationshipMapper';
import EmptyDashboard from './pages/EmptyDashboard';
import { DialogProvider } from './context/DialogContext';

function App() {
  const isAuthenticated = !!localStorage.getItem('token');

  return (
    <DialogProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={!isAuthenticated ? <Auth /> : <Navigate to="/" />} />
          
          <Route path="/" element={isAuthenticated ? <Dashboard /> : <Navigate to="/auth" />}>
            <Route index element={<EmptyDashboard />} />
            <Route path="dataset/:id" element={<Chat />} />
            <Route path="relationships" element={<RelationshipMapper />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DialogProvider>
  );
}

export default App;
