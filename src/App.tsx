import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardPage } from './pages/DashboardPage';
import { PatientsPage } from './pages/PatientsPage';
import { CreateInstructionsPage } from './pages/CreateInstructionsPage';
import { ReviewQueuePage } from './pages/ReviewQueuePage';
import { DocumentsHistoryPage } from './pages/DocumentsHistoryPage';
import { SettingsPage } from './pages/SettingsPage';

import { DischargeDocument, HospitalInfo } from './types/discharge';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [clinicianName, setClinicianName] = useState<string>('Dr. Sarah Jenkins, MD');
  const [documents, setDocuments] = useState<DischargeDocument[]>([]);
  const [activeDocument, setActiveDocument] = useState<DischargeDocument | null>(null);

  // Active Patient Context (Patient Isolation)
  const [activePatientContext, setActivePatientContext] = useState<{
    name: string;
    id: string;
  } | null>(null);

  const [hospitalInfo, setHospitalInfo] = useState<HospitalInfo>({
    name: 'Apollo General Hospital & Heart Center',
    department: 'Department of Cardiology & Clinical Operations',
  });

  // Fetch documents from repository on load
  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/discharge-documents');
      if (res.ok) {
        const data: DischargeDocument[] = await res.json();
        // Deduplicate documents by ID
        const uniqueDocs = Array.from(
          new Map(data.map((doc) => [doc.id, doc])).values()
        );
        setDocuments(uniqueDocs);
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleDocumentCreated = (doc: DischargeDocument) => {
    setDocuments((prev) => {
      const filtered = prev.filter((d) => d.id !== doc.id);
      return [doc, ...filtered];
    });
  };

  const handleStartNewDocument = () => {
    setActiveDocument(null);
    setActivePatientContext(null);
    setActiveTab('create');
  };

  const handleStartNewDocumentForPatient = (name: string, id: string) => {
    setActivePatientContext({ name, id });
    setActiveDocument(null);
    setActiveTab('create');
  };

  const handleSelectDocumentForReview = (doc: DischargeDocument) => {
    setActiveDocument(doc);
    if (doc.verifiedData?.patient) {
      setActivePatientContext({
        name: doc.verifiedData.patient.name.value,
        id: doc.verifiedData.patient.patientId.value,
      });
    }
    setActiveTab('create');
  };

  const pendingReviewCount = documents.filter(
    (d) => d.approvalStatus !== 'APPROVED' || d.auditResult?.overallStatus === 'CRITICAL_ISSUE'
  ).length;

  return (
    <div className="flex h-screen bg-slate-100 font-sans text-slate-900 overflow-hidden">
      {/* Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          if (tab === 'create' && !activeDocument) {
            setActiveDocument(null);
          }
          setActiveTab(tab);
        }}
        clinicianName={clinicianName}
        setClinicianName={setClinicianName}
        pendingReviewCount={pendingReviewCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Header
          activeTab={activeTab}
          activePatientName={activePatientContext?.name}
          activePatientId={activePatientContext?.id}
          onClearPatientContext={() => setActivePatientContext(null)}
          onStartNewDocument={handleStartNewDocument}
          hospitalName={hospitalInfo.name}
        />

        <main className="flex-1">
          {activeTab === 'dashboard' && (
            <DashboardPage
              documents={documents}
              onStartNewDocument={handleStartNewDocument}
              onSelectDocument={handleSelectDocumentForReview}
              onSelectPatient={(name, id) => setActivePatientContext({ name, id })}
            />
          )}

          {activeTab === 'create' && (
            <CreateInstructionsPage
              clinicianName={clinicianName}
              hospitalInfo={hospitalInfo}
              initialDocument={activeDocument}
              activePatientContext={activePatientContext}
              onClearPatientContext={() => setActivePatientContext(null)}
              onDocumentCreated={handleDocumentCreated}
            />
          )}

          {activeTab === 'review-queue' && (
            <ReviewQueuePage
              documents={documents}
              onSelectDocumentForReview={handleSelectDocumentForReview}
            />
          )}

          {activeTab === 'patients' && (
            <PatientsPage
              documents={documents}
              onSelectPatient={(name, id) => setActivePatientContext({ name, id })}
              onStartNewDocumentForPatient={handleStartNewDocumentForPatient}
            />
          )}

          {activeTab === 'documents' && (
            <DocumentsHistoryPage
              documents={documents}
              onSelectDocument={handleSelectDocumentForReview}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsPage
              hospitalInfo={hospitalInfo}
              setHospitalInfo={setHospitalInfo}
              clinicianName={clinicianName}
              setClinicianName={setClinicianName}
            />
          )}
        </main>
      </div>
    </div>
  );
};
