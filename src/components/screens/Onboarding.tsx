import { useState } from 'react';
import { Phone, User as UserIcon, ArrowRight } from 'lucide-react';
import { auth, db } from '../../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface OnboardingProps {
  onComplete: () => void;
}

import { COUNTRY_CODES } from '../../utils/countryCodes';

export function Onboarding({ onComplete }: OnboardingProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobileCountryCode, setMobileCountryCode] = useState('+1');
  const [mobileNumber, setMobileNumber] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    setError('');
    setIsLoading(true);

    try {
      if (!firstName.trim() || !lastName.trim() || !mobileCountryCode.trim() || !mobileNumber.trim()) {
        throw new Error('Please fill in all required fields');
      }
      
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        mobileCountryCode: mobileCountryCode.trim(),
        mobileNumber: mobileNumber.trim(),
        email: auth.currentUser.email,
        displayName: auth.currentUser.displayName || `${firstName.trim()} ${lastName.trim()}`,
        createdAt: serverTimestamp(),
        onboardingComplete: true
      }, { merge: true });
      
      onComplete();
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving profile');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg text-text p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-4">
            <UserIcon className="text-primary w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold mb-2 text-center">Complete your profile</h1>
          <p className="text-text/60 text-center">Just a few more details before we start.</p>
        </div>

        <div className="bg-surface/50 border border-white/10 rounded-3xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
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

            {error && (
              <div className="text-red-400 text-sm text-center bg-red-400/10 p-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-bg font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50 mt-8"
            >
              Complete Profile
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
