import React, { useState, useEffect } from 'react';
import { supabase } from '../data/supabaseClient.js';
import { getProfile } from '../data/reportRepository.js';
import { normalizeUsername } from '../utils/auth.js';
import { appendReportEntry, listRecentReportEntries } from '../backend/reportEntryRepository.js';
import { loadDraft, saveDraft, clearDraft } from '../backend/reportEntryStorage.js';
import { validateReportEntry, formatDateLaPaz, formatDateTimeLaPaz } from '../domain/reportEntry.js';
import Modal from './Modal.jsx';

export default function ReportPopup({ isOpen, onClose, triggerRef }) {
  const [hasOpened, setHasOpened] = useState(isOpen);
  if (isOpen && !hasOpened) {
    setHasOpened(true);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} ariaLabel="Mi Reporte" triggerRef={triggerRef}>
      {hasOpened && <ReportContent />}
    </Modal>
  );
}

function Counter({ label, value, onChange, disabled }) {
  const handleDec = () => onChange(Math.max(0, value - 1));
  const handleInc = () => onChange(Math.min(9999, value + 1));
  
  return (
    <div className="counter-field">
      <label>{label}</label>
      <div className="counter-controls">
        <button type="button" aria-label={`Reducir ${label}`} onClick={handleDec} disabled={disabled || value <= 0}>-1</button>
        <span className="counter-value">{value}</span>
        <button type="button" aria-label={`Incrementar ${label}`} onClick={handleInc} disabled={disabled || value >= 9999}>+1</button>
      </div>
    </div>
  );
}

function ReportContent() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsSubmitting(true);
    if (password.length < 8) {
      setLoginError('La contraseña debe tener al menos 8 caracteres.');
      setIsSubmitting(false);
      return;
    }
    try {
      const syntheticEmail = normalizeUsername(username);
      const { error } = await supabase.auth.signInWithPassword({
        email: syntheticEmail,
        password: password
      });
      if (error) {
        setLoginError('Usuario o contraseña incorrectos, o cuenta inactiva.');
      }
    } catch (err) {
      setLoginError(err.message);
    }
    setIsSubmitting(false);
  };

  if (loadingSession) return <h2>Cargando sesión...</h2>;

  if (!session) {
    return (
      <div className="auth-form">
        <h2>Ingresar a Mi Reporte</h2>
        <form onSubmit={handleLogin}>
          <label>Usuario
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required disabled={isSubmitting}/>
          </label>
          <label>Contraseña
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required disabled={isSubmitting}/>
          </label>
          {loginError && <p className="error-alert" role="alert">{loginError}</p>}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    );
  }

  return <ActiveReport session={session} />
}

function ActiveReport({ session }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  
  const [calls, setCalls] = useState(0);
  const [emails, setEmails] = useState(0);
  const [liveChats, setLiveChats] = useState(0);
  const [clientEntryId, setClientEntryId] = useState(() => crypto.randomUUID());
  
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    let active = true;
    
    const loadData = async () => {
      setLoading(true);
      setError('');
      
      const profRes = await getProfile();
      if (!active) return;
      if (!profRes.success) {
        setError('Error al cargar perfil o cuenta inactiva.');
        setLoading(false);
        return;
      }
      if (profRes.data.status !== 'active') {
        setError('Tu cuenta está desactivada.');
        setLoading(false);
        return;
      }
      setProfile(profRes.data);

      const draft = loadDraft(session.user.id);
      if (draft) {
        setCalls(draft.calls);
        setEmails(draft.emails);
        setLiveChats(draft.liveChats);
        setClientEntryId(draft.clientEntryId);
      }

      const histRes = await listRecentReportEntries();
      if (active) {
        if (histRes.success) {
          setHistory(histRes.data);
        } else {
          setError(histRes.error);
        }
        setLoading(false);
      }
    };
    
    loadData();
    return () => { active = false; };
  }, [session.user.id]);

  useEffect(() => {
    if (!profile) return;
    const res = saveDraft(session.user.id, { calls, emails, liveChats, clientEntryId });
    if (res && !res.success) {
      setTimeout(() => setStorageWarning(res.error), 0);
    } else {
      setTimeout(() => setStorageWarning(''), 0);
    }
  }, [calls, emails, liveChats, clientEntryId, profile, session.user.id]);

  const handleLogout = async () => {
    const { error: err } = await supabase.auth.signOut();
    if (err) setError(err.message);
  };

  const handleClear = () => {
    setCalls(0);
    setEmails(0);
    setLiveChats(0);
    setClientEntryId(crypto.randomUUID());
    const res = clearDraft(session.user.id);
    if (res && !res.success) {
      setTimeout(() => setStorageWarning(res.error), 0);
    } else {
      setTimeout(() => setStorageWarning(''), 0);
    }
  };

  const handleSave = async () => {
    setError('');
    setSavedNotice(false);
    
    const val = validateReportEntry({ calls, emails, liveChats });
    if (!val.valid) {
      setError(val.error);
      return;
    }
    if (val.data.total === 0) {
      setError('El total debe ser mayor que cero.');
      return;
    }

    setSaving(true);
    
    const res = await appendReportEntry({
      calls: val.data.calls,
      emails: val.data.emails,
      liveChats: val.data.liveChats,
      clientEntryId
    });

    if (res.success) {
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
      
      setCalls(0);
      setEmails(0);
      setLiveChats(0);
      setClientEntryId(crypto.randomUUID());
      const clrRes = clearDraft(session.user.id);
      if (clrRes && !clrRes.success) {
        setStorageWarning(clrRes.error);
      } else {
        setTimeout(() => setStorageWarning(''), 0);
      }
      
      const histRes = await listRecentReportEntries();
      if (histRes.success) {
        setHistory(histRes.data);
      } else {
        setError(histRes.error);
      }
    } else {
      setError(res.error);
    }
    setSaving(false);
  };

  const val = validateReportEntry({ calls, emails, liveChats });
  const displayTotal = val.valid ? val.data.total : 0;
  const isTotalZero = displayTotal === 0;

  if (loading) return <h2>Cargando datos...</h2>;

  return (
    <div className="active-report">
      <header className="report-header">
        <h2>Mi Reporte</h2>
        <div className="profile-info">
          <span>{profile?.display_name || 'Perfil'}</span>
          <button onClick={handleLogout} className="logout-btn">Cerrar Sesión</button>
        </div>
      </header>
      
      {error && <p className="error-alert" role="alert">{error}</p>}
      {storageWarning && <p className="warning-alert" role="alert">{storageWarning}</p>}
      
      {profile?.status === 'active' && (
        <>
          <div className="report-form">
            <p><strong>Fecha Laboral:</strong> {formatDateLaPaz()}</p>
            
            <div className="report-counters-group">
              <Counter label="Calls" value={calls} onChange={setCalls} disabled={saving} />
              <Counter label="Emails" value={emails} onChange={setEmails} disabled={saving} />
              <Counter label="Live Chats" value={liveChats} onChange={setLiveChats} disabled={saving} />
            </div>

            <p className="report-total"><strong>Total:</strong> {displayTotal}</p>

            <div className="report-actions">
              <button onClick={handleSave} disabled={saving || isTotalZero || !val.valid}>
                {saving ? 'Guardando...' : 'Guardar Reporte'}
              </button>
              <button onClick={handleClear} disabled={saving} className="clear-btn">
                Limpiar
              </button>
            </div>

            {savedNotice && <div className="success-notice-block" role="status">¡Reporte guardado exitosamente!</div>}
          </div>
          
          <div className="report-history">
            <h3>Historial de Reportes</h3>
            {history.length === 0 ? <p>No hay reportes recientes.</p> : (
              <ul>
                {history.map(h => (
                  <li key={h.id}>
                    <span className="hist-date">{formatDateTimeLaPaz(h.createdAt)}</span>
                    <span className="hist-stats">C: {h.calls} | E: {h.emails} | Ch: {h.liveChats}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
