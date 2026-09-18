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
    <Modal isOpen={isOpen} onClose={onClose} ariaLabel="Mi Reporte" triggerRef={triggerRef} className="report-modal report-workspace-modal">
      {hasOpened && <ReportContent />}
    </Modal>
  );
}

function Counter({ label, value, onChange, disabled }) {
  const handleDec = () => onChange(Math.max(0, value - 1));
  const handleInc = () => onChange(Math.min(9999, value + 1));

  return (
    <section className="counter-field" aria-label={label}>
      <h3><span className="channel-dot" aria-hidden="true" />{label}</h3>
      <output className="counter-value" aria-label={`Cantidad de ${label}`} aria-live="polite">{value}</output>
      <div className="counter-controls">
        <button type="button" aria-label={`Reducir ${label}`} onClick={handleDec} disabled={disabled || value <= 0}>-1</button>
        <button type="button" className="counter-increment" aria-label={`Incrementar ${label}`} onClick={handleInc} disabled={disabled || value >= 9999}>+1 {label === 'Calls' ? 'Call' : label === 'Emails' ? 'Email' : 'Chat'}</button>
      </div>
    </section>
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (_event === 'SIGNED_IN' || _event === 'SIGNED_OUT' || _event === 'TOKEN_REFRESHED' || _event === 'INITIAL_SESSION') {
         setSession(newSession);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
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
      <div className="auth-form report-login">
        <p className="eyebrow">TU ACTIVIDAD DE SOPORTE</p>
        <h2>Ingresar a Mi Reporte</h2>
        <p className="popup-description">Registra tus llamadas, correos y chats en un solo lugar.</p>
        <form onSubmit={handleLogin}>
          <label>Usuario
            <input type="text" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required disabled={isSubmitting}/>
          </label>
          <label>Contraseña
            <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={isSubmitting}/>
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
    let timerId;
    if (savedNotice) {
      timerId = setTimeout(() => setSavedNotice(false), 3000);
    }
    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [savedNotice]);

  const updateDraft = (newCalls, newEmails, newLiveChats, newClientEntryId) => {
    if (!profile) return;
    const res = saveDraft(session.user.id, {
      calls: newCalls,
      emails: newEmails,
      liveChats: newLiveChats,
      clientEntryId: newClientEntryId
    });
    setStorageWarning(res && !res.success ? res.error : '');
  };

  const handleCallsChange = (val) => {
    setCalls(val);
    updateDraft(val, emails, liveChats, clientEntryId);
  };

  const handleEmailsChange = (val) => {
    setEmails(val);
    updateDraft(calls, val, liveChats, clientEntryId);
  };

  const handleLiveChatsChange = (val) => {
    setLiveChats(val);
    updateDraft(calls, emails, val, clientEntryId);
  };

  const handleLogout = async () => {
    const { error: err } = await supabase.auth.signOut();
    if (err) setError(err.message);
  };

  const handleClear = () => {
    setCalls(0);
    setEmails(0);
    setLiveChats(0);
    const newId = crypto.randomUUID();
    setClientEntryId(newId);
    const res = clearDraft(session.user.id);
    setStorageWarning(res && !res.success ? res.error : '');
  };

  const handleSave = async () => {
    if (saving) return;

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
      setCalls(0);
      setEmails(0);
      setLiveChats(0);
      const newId = crypto.randomUUID();
      setClientEntryId(newId);

      const clrRes = clearDraft(session.user.id);
      setStorageWarning(clrRes && !clrRes.success ? clrRes.error : '');

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
        <div><p className="eyebrow">TU ACTIVIDAD DE SOPORTE</p><h2>Mi Reporte</h2></div>
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
            <div className="report-entry-heading"><p className="report-date"><strong>Fecha Laboral:</strong> {formatDateLaPaz()}</p><span className="draft-badge">Borrador</span></div>

            <div className="report-counters-group">
              <Counter label="Calls" value={calls} onChange={handleCallsChange} disabled={saving} />
              <Counter label="Emails" value={emails} onChange={handleEmailsChange} disabled={saving} />
              <Counter label="Live Chats" value={liveChats} onChange={handleLiveChatsChange} disabled={saving} />
            </div>

            <div className="report-total"><div><strong>Total de esta entrada</strong><p>Calls + Emails + Live Chats</p></div><output aria-label="Total de esta entrada" aria-live="polite">{displayTotal}</output></div>
            <p className="report-save-hint">Cada guardado añade una nueva entrada al historial y reinicia los contadores.</p>

            <div className="report-actions">
              <button className="report-save-button" onClick={handleSave} disabled={saving || isTotalZero || !val.valid}>
                {saving ? 'Guardando...' : 'Guardar Reporte'}
              </button>
              <button onClick={handleClear} disabled={saving} className="clear-btn">
                Cancelar / Limpiar
              </button>
            </div>

            {savedNotice && <div className="success-notice-block" role="status">¡Reporte guardado exitosamente!</div>}
          </div>

          <div className="report-history">
            <div className="report-history-heading"><h3>Historial de Reportes</h3><span>Últimas 30 entradas</span></div>
            {history.length === 0 ? <p className="report-empty">No hay reportes recientes.</p> : (
              <ul>
                {history.map(h => (
                  <li key={h.id}>
                    <span className="hist-date">{formatDateTimeLaPaz(h.createdAt)}</span>
                    <span className="hist-stats">Calls: {h.calls} · Emails: {h.emails} · Live Chats: {h.liveChats}</span>
                    <span className="hist-total">{h.total ?? h.calls + h.emails + h.liveChats} <small>total</small></span>
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
