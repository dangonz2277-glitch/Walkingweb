import { useState, useEffect } from 'react';
import { supabase } from '../data/supabaseClient.js';
import { getProfile, getTodayReport, setResolvedCount, listMyReports } from '../data/reportRepository.js';
import { getWorkDate } from '../utils/date.js';
import { normalizeUsername } from '../utils/auth.js';

import Modal from './Modal.jsx';

export default function ReportPopup({ isOpen, onClose, triggerRef }) {
  const [hasOpened, setHasOpened] = useState(isOpen);
  if (isOpen && !hasOpened) {
    setHasOpened(true);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} triggerRef={triggerRef}>
      {hasOpened && <ReportContent />}
    </Modal>
  );
}

function ReportContent() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

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

  if (loadingSession) return <p>Cargando sesión...</p>;

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

  return <ActiveReport />
}

function ActiveReport() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [workDate] = useState(getWorkDate);
  const [count, setCount] = useState('');
  const [revision, setRevision] = useState(0);
  const [serverConflictCount, setServerConflictCount] = useState(null);
  const [serverConflictRevision, setServerConflictRevision] = useState(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    let active = true;
    const today = getWorkDate();
    
    const loadData = async (date) => {
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

      const reportRes = await getTodayReport(date);
      if (active) {
        if (!reportRes.success) {
          setError(reportRes.error);
        } else if (reportRes.data) {
          setCount(reportRes.data.resolvedCount.toString());
          setRevision(reportRes.data.revision);
        } else {
          setCount('0');
          setRevision(0);
        }
      }

      const histRes = await listMyReports();
      if (active) {
        if (histRes.success) {
          setHistory(histRes.data);
        } else {
          setError(histRes.error);
        }
        setLoading(false);
      }
    };
    
    loadData(today);
    return () => { active = false; };
  }, []);

  const handleLogout = async () => {
    const { error: err } = await supabase.auth.signOut();
    if (err) setError(err.message);
  };

  const handleSave = async (forceOverwrite = false) => {
    setError('');
    setSavedNotice(false);
    
    if (!/^\d+$/.test(count)) {
      setError('El número de tickets resueltos debe ser un entero válido sin decimales ni letras.');
      return;
    }
    let numericCount = Number(count);
    if (!Number.isInteger(numericCount) || numericCount < 0 || numericCount > 9999) {
      setError('El número de tickets resueltos debe ser un entero entre 0 y 9999.');
      return;
    }
    const newCount = numericCount;

    setSaving(true);
    
    let revToUse = revision;
    if (forceOverwrite) {
       revToUse = serverConflictRevision;
    }

    const res = await setResolvedCount(workDate, newCount, revToUse);
    if (res.success) {
      setRevision(res.data.revision);
      setServerConflictCount(null);
      setServerConflictRevision(null);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
      
      const histRes = await listMyReports();
      if (histRes.success) {
        setHistory(histRes.data);
      } else {
        setError(histRes.error);
      }
    } else if (res.conflict) {
      const reportRes = await getTodayReport(workDate);
      if (reportRes.success && reportRes.data) {
        setServerConflictCount(reportRes.data.resolvedCount);
        setServerConflictRevision(reportRes.data.revision);
      } else {
        setError('Conflicto detectado, pero no se pudo leer el valor remoto.');
      }
    } else {
      setError(res.error);
    }
    setSaving(false);
  };

  const resolveConflictOverwrite = () => {
    handleSave(true);
  };

  const resolveConflictSync = () => {
    setCount(serverConflictCount.toString());
    setRevision(serverConflictRevision);
    setServerConflictCount(null);
    setServerConflictRevision(null);
  };

  if (loading) return <p>Cargando datos...</p>;

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
      
      {profile?.status === 'active' && (
        <>
          <div className="report-form">
            <p><strong>Fecha Laboral:</strong> {workDate}</p>
            <label>
              Tickets Resueltos (0 - 9999)
              <input 
                type="number" 
                min="0" 
                max="9999" 
                step="1"
                value={count} 
                onChange={(e) => setCount(e.target.value)} 
                disabled={saving || serverConflictCount !== null} 
              />
            </label>
            {serverConflictCount === null && (
              <button onClick={() => handleSave(false)} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar Reporte'}
              </button>
            )}
            {savedNotice && <div className="success-notice-block" role="status">¡Reporte guardado exitosamente!</div>}
            
            {serverConflictCount !== null && (
              <div className="conflict-box">
                <p><strong>¡Conflicto de versión!</strong> El servidor tiene un valor diferente ({serverConflictCount} tickets resueltos).</p>
                <div className="conflict-actions">
                  <button onClick={resolveConflictSync}>Adoptar valor remoto</button>
                  <button onClick={resolveConflictOverwrite} className="danger">Sobrescribir con mi valor ({count})</button>
                </div>
              </div>
            )}
          </div>
          
          <div className="report-history">
            <h3>Historial de Reportes</h3>
            {history.length === 0 ? <p>No hay reportes recientes.</p> : (
              <ul>
                {history.map(h => (
                  <li key={h.workDate}>
                    {h.workDate}: {h.resolvedCount} tickets resueltos
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
