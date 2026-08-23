import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrainCircuit } from 'lucide-react';
import api from '../utils/api';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const authMutation = useMutation({
    mutationFn: async () => {
      if (isLogin) {
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);
        
        const response = await api.post('/auth/login', formData, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return { type: 'login' as const, data: response.data };
      } else {
        const response = await api.post('/auth/register', { email, password });
        return { type: 'register' as const, data: response.data };
      }
    },
    onSuccess: (result) => {
      if (result.type === 'login') {
        localStorage.setItem('token', result.data.access_token);
        navigate('/');
        window.location.reload(); 
      } else {
        toast.success("Registration successful. Please log in.");
        setIsLogin(true);
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || "An error occurred");
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    authMutation.mutate();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="p-10 w-full max-w-[420px] bg-[#11141d] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] rounded-xl border border-white/5">
        <div className="flex items-center justify-center gap-3 mb-10">
          <BrainCircuit size={40} className="text-accent-primary" />
          <h1 className="text-3xl font-bold m-0 text-white">QueryMind</h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-400">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-[#1e2433] border border-white/10 rounded-lg p-3 text-white w-full outline-none focus:border-accent-primary transition-colors disabled:opacity-50"
              required
              disabled={authMutation.isPending}
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-400">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-[#1e2433] border border-white/10 rounded-lg p-3 text-white w-full outline-none focus:border-accent-primary transition-colors disabled:opacity-50"
              required
              disabled={authMutation.isPending}
            />
          </div>

          <button 
            type="submit" 
            className="w-full flex justify-center mt-4 p-3 bg-accent-gradient text-white border-none rounded-lg font-semibold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={authMutation.isPending}
          >
            {authMutation.isPending ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-400">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="bg-transparent border-none text-accent-primary cursor-pointer hover:underline outline-none p-0"
            disabled={authMutation.isPending}
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
