import { useState } from 'react';
import { Mail, Phone, User as UserIcon, Lock, ArrowRight } from 'lucide-react';
import { signInWithGoogle, auth, db } from '../../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { COUNTRY_CODES } from '../../utils/countryCodes';

export function Login() {
  const [isLogin, setIsLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobileCountryCode, setMobileCountryCode] = useState('+1');
  const [mobileNumber, setMobileNumber] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (!firstName.trim() || !lastName.trim() || !mobileCountryCode.trim() || !mobileNumber.trim()) {
          throw new Error('Please fill in all required fields');
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await setDoc(doc(db, 'users', user.uid), {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          mobileCountryCode: mobileCountryCode.trim(),
          mobileNumber: mobileNumber.trim(),
          email: user.email,
          createdAt: serverTimestamp(),
          onboardingComplete: true
        });
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setIsLoading(true);
    try {
      await signInWithGoogle();
      // Onboarding check is handled automatically in App.tsx
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg text-text p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-4">
            <span className="text-3xl">🗺️</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Guía Viva</h1>
          <p className="text-text/60 text-center">Your personal AI tour guide.</p>
        </div>

        <div className="bg-surface/50 border border-white/10 rounded-3xl p-6">
          <button 
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full bg-white text-black font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-3 hover:bg-gray-200 transition-colors mb-6 disabled:opacity-50"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
            Continue with Google
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-surface text-text/50">Or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div className="flex gap-4">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-text/60 ml-1">First Name</label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-text/40 w-5 h-5" />
                      <input
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full bg-bg border border-white/10 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-primary transition-colors"
                        placeholder="John"
                      />
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-text/60 ml-1">Last Name</label>
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full bg-bg border border-white/10 rounded-xl py-3 px-4 outline-none focus:border-primary transition-colors"
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-text/60 ml-1">Mobile Number</label>
                  <div className="flex gap-2">
                    <div className="relative w-24 flex-shrink-0">
                      <select
                        required
                        value={mobileCountryCode}
                        onChange={(e) => setMobileCountryCode(e.target.value)}
                        className="w-full bg-bg border border-white/10 rounded-xl py-3 px-2 outline-none focus:border-primary transition-colors text-center appearance-none"
                      >
                        {COUNTRY_CODES.map(({ code, country }) => (
                          <option key={`${country}-${code}`} value={code}>
                            {country} ({code})
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                    <div className="relative flex-1">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-text/40 w-5 h-5" />
                      <input
                        type="tel"
                        required
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        className="w-full bg-bg border border-white/10 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-primary transition-colors"
                        placeholder="234 567 890"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1">
              <label className="text-xs text-text/60 ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text/40 w-5 h-5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-bg border border-white/10 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-primary transition-colors"
                  placeholder="john@example.com"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-text/60 ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text/40 w-5 h-5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-bg border border-white/10 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-primary transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="text-red-400 text-sm text-center bg-red-400/10 p-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-bg font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50 mt-4"
            >
              {isLogin ? 'Sign In' : 'Create Account'}
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-text/60">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline font-medium"
            >
              {isLogin ? 'Sign up' : 'Log in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
