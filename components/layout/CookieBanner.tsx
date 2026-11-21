"use client";
import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function CookieBanner() {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState({
    necessary: true, // Always true, cannot be disabled
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    const consent = localStorage.getItem('drivo_cookie_consent');
    if (!consent) {
      setVisible(true);
    }
  }, []);

  const saveConsent = () => {
    const consentData = {
      ...preferences,
      timestamp: new Date().toISOString(),
      version: '1.0',
    };
    localStorage.setItem('drivo_cookie_consent', JSON.stringify(consentData));
    setVisible(false);
  };

  const acceptAll = () => {
    setPreferences({ necessary: true, analytics: true, marketing: true });
    setTimeout(() => saveConsent(), 0);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] p-4 md:p-6 animate-fade-up">
      <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-elevated border border-drivo-border-light p-6 md:p-8">
        <div className="flex items-start gap-4">
          <span className="text-2xl shrink-0">🍪</span>
          <div className="flex-1">
            <h3 className="text-[16px] font-bold text-drivo-text mb-1">{t('cookie.title')}</h3>
            <p className="text-[13px] text-drivo-text-secondary mb-4">
              {t('cookie.description')}
            </p>
            
            {showDetails && (
              <div className="mb-4 p-4 bg-gray-50 rounded-2xl space-y-3 animate-fade-in">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[14px] font-semibold text-drivo-text">{t('cookie.necessary')}</p>
                    <p className="text-[12px] text-drivo-text-secondary">{t('cookie.necessaryDescription')}</p>
                  </div>
                  <span className="text-[11px] text-gray-500 bg-gray-200 px-2 py-1 rounded-full">{t('cookie.alwaysActive')}</span>
                </div>
                
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[14px] font-semibold text-drivo-text">{t('cookie.analytics')}</p>
                    <p className="text-[12px] text-drivo-text-secondary">{t('cookie.analyticsDescription')}</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer">
                    <input aria-label={t('cookie.analytics')}
                      type="checkbox" 
                      checked={preferences.analytics} 
                      onChange={(e) => setPreferences(prev => ({ ...prev, analytics: e.target.checked }))}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-drivo-green peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                  </label>
                </div>
                
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[14px] font-semibold text-drivo-text">{t('cookie.marketing')}</p>
                    <p className="text-[12px] text-drivo-text-secondary">{t('cookie.marketingDescription')}</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer">
                    <input aria-label={t('cookie.marketing')}
                      type="checkbox" 
                      checked={preferences.marketing} 
                      onChange={(e) => setPreferences(prev => ({ ...prev, marketing: e.target.checked }))}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-drivo-green peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 mt-5">
          <button onClick={acceptAll} className="btn-primary text-[13px] py-3">{t('cookie.acceptAll')}</button>
          <button onClick={() => setShowDetails(!showDetails)} className="btn-outline text-[13px] py-3">
            {showDetails ? t('cookie.hideDetails') : t('cookie.customize')}
          </button>
          {showDetails && (
            <button onClick={saveConsent} className="btn-outline text-[13px] py-3">
              {t('cookie.save')}
            </button>
          )}
          <a href="/privacy" className="text-[13px] text-drivo-text-secondary underline py-3 text-center">
            {t('footer.privacy')}
          </a>
        </div>
        
        <p className="text-[11px] text-drivo-text-muted mt-4 text-center">
          {t('cookie.preferencesHelp')}
        </p>
      </div>
    </div>
  );
}
