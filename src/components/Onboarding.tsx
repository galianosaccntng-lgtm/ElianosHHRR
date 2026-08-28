import React, { useState, useEffect } from 'react';
import { Camera, Upload, CheckCircle2, AlertCircle } from 'lucide-react';

interface UploadedDoc {
  docType: string;
  fileName: string;
  uploadedAt: string;
}

const translations = {
  es: {
    invalidLink: "Enlace Inválido",
    invalidLinkDesc: "Este enlace ya no es válido, contacta a RRHH",
    networkError: "Error de conexión",
    fileTooLarge: "El archivo es demasiado grande (máx 10 MB)",
    uploadError: "Error al subir documento",
    thankYou: "¡Gracias!",
    completedDesc: "Todos tus documentos han sido enviados de manera segura. Nuestro equipo de RRHH los revisará pronto.",
    welcomeTeam: (name: string) => `¡Bienvenido/a al equipo, ${name}!`,
    pleaseUpload: "Por favor, sube los siguientes documentos requeridos de manera segura para completar tu proceso de contratación.",
    progress: "Progreso de Subida",
    pending: "Subida pendiente",
    replace: "Reemplazar",
    upload: "Subir"
  },
  en: {
    invalidLink: "Invalid Link",
    invalidLinkDesc: "This link is no longer valid, contact HR",
    networkError: "Connection error",
    fileTooLarge: "File is too large (max 10 MB)",
    uploadError: "Error uploading document",
    thankYou: "Thank you!",
    completedDesc: "All your documents have been securely submitted. Our HR team will review them shortly.",
    welcomeTeam: (name: string) => `Welcome to the team, ${name}!`,
    pleaseUpload: "Please securely upload the following required documents to complete your hiring process.",
    progress: "Upload Progress",
    pending: "Pending upload",
    replace: "Replace",
    upload: "Upload"
  }
};

export function Onboarding() {
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    
    if (!tokenParam) {
      setError("No token provided");
      setLoading(false);
      return;
    }
    
    setToken(tokenParam);

    fetch(`/api/onboarding/session?token=${tokenParam}`)
      .then(res => res.json().then(data => ({ status: res.status, data })))
      .then(({ status, data }) => {
        if (status !== 200) {
          setError(data.error || "Este enlace ya no es válido, contacta a RRHH");
        } else {
          setSession(data);
        }
      })
      .catch(() => {
        setError("Error de conexión");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("El archivo es demasiado grande (máx 10 MB)");
      return;
    }
    
    setUploading(prev => ({ ...prev, [docType]: true }));

    const formData = new FormData();
    formData.append('token', token);
    formData.append('docType', docType);
    formData.append('file', file);

    try {
      const res = await fetch('/api/onboarding/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      if (!res.ok) {
        alert(data.error || "Error al subir documento");
      } else {
        setSession((prev: any) => ({
          ...prev,
          status: data.status,
          uploaded: data.uploaded
        }));
      }
    } catch (err) {
      alert("Error de red al subir documento");
    } finally {
      setUploading(prev => ({ ...prev, [docType]: false }));
      if (e.target) e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-900"></div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-serif font-bold text-gray-900 mb-2">{translations.es.invalidLink}</h2>
          <p className="text-gray-600">{error || translations.es.invalidLinkDesc}</p>
        </div>
      </div>
    );
  }

  const { candidateName, language, requiredDocTypes, uploaded, status } = session;
  const t = translations[language as 'en' | 'es'] || translations.es;
  
  const totalRequired = requiredDocTypes.length;
  const totalUploaded = uploaded.length;
  const progressPercent = Math.round((totalUploaded / totalRequired) * 100);

  const getDocTypeLabel = (type: string) => {
    const labels: Record<string, { en: string; es: string }> = {
      'photo_id': { en: 'Photo ID', es: 'Identificación con Foto' },
      'work_authorization': { en: 'Work Authorization (I-9)', es: 'Autorización de Empleo / SSN' },
      'direct_deposit': { en: 'Direct Deposit Form', es: 'Datos de Depósito Directo' },
      'emergency_contact': { en: 'Emergency Contact Info', es: 'Contacto de Emergencia' },
    };
    return labels[type] ? labels[type][language as 'en' | 'es'] : type;
  };

  if (status === 'completed' || status === 'submitted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm text-center border border-gray-100">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-gray-900 mb-2">
            {t.thankYou}
          </h2>
          <p className="text-gray-600">
            {t.completedDesc}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-red-900 text-white pt-12 pb-24 px-4 relative">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-serif font-bold mb-2">
            {t.welcomeTeam(candidateName)}
          </h1>
          <p className="text-red-100 opacity-90 max-w-xl">
            {t.pleaseUpload}
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 -mt-12 relative z-10">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8">
          <div className="p-6 border-b border-gray-100">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-600 uppercase tracking-wider">
                {t.progress}
              </span>
              <span className="text-sm font-bold text-gray-900">{totalUploaded} / {totalRequired}</span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-red-900 h-full transition-all duration-500 ease-in-out" 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="divide-y divide-gray-50">
            {requiredDocTypes.map((docType: string) => {
              const uploadedDoc = uploaded.find((u: UploadedDoc) => u.docType === docType);
              const isUploading = uploading[docType];

              return (
                <div key={docType} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-gray-900 flex items-center gap-2">
                      {getDocTypeLabel(docType)}
                      {uploadedDoc && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                    </h3>
                    {uploadedDoc ? (
                      <p className="text-sm text-gray-500 mt-1 truncate max-w-xs">{uploadedDoc.fileName}</p>
                    ) : (
                      <p className="text-sm text-gray-500 mt-1">
                        {t.pending}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex shrink-0">
                    <label className={`relative flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer border ${uploadedDoc ? 'border-gray-200 text-gray-700 hover:bg-gray-50' : 'bg-red-900 text-white hover:bg-red-800'}`}>
                      {isUploading ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          <span>{uploadedDoc ? t.replace : t.upload}</span>
                        </>
                      )}
                      <input 
                        type="file" 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                        accept="image/jpeg,image/png,image/heic,application/pdf"
                        onChange={(e) => handleFileUpload(e, docType)}
                        disabled={isUploading}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
