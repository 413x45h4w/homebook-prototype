import { HashRouter, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { NotFound, ToastProvider } from './components/ui';
import { StoreProvider } from './lib/store';
import { SearchPage, NotificationsPage } from './pages/find';
import { HomeSwitch } from './pages/home';
import { ExportPage, PacketPage, SharePage } from './pages/house';
import { KnowledgeItem, KnowledgeList } from './pages/knowledge';
import { MessagesPage, ThreadPage } from './pages/messages';
import { BookPage, ProviderPage, ProvidersPage } from './pages/people';
import { VisitPage, VisitsPage } from './pages/visits';
import { VoicePage } from './pages/voice';
import { SpClient, SpClients, SpGate, SpPayments, SpSchedule, SpToday } from './pages/work';

export default function App() {
  return (
    <HashRouter>
      <StoreProvider>
        <ToastProvider>
          <Routes>
            <Route element={<Shell />}>
              <Route path="/" element={<HomeSwitch />} />
              <Route path="/knowledge" element={<KnowledgeList />} />
              <Route path="/knowledge/new" element={<KnowledgeItem />} />
              <Route path="/voice" element={<VoicePage />} />
              <Route path="/voice/:spId" element={<VoicePage />} />
              <Route path="/knowledge/:id" element={<KnowledgeItem />} />
              <Route path="/packet/:kind" element={<PacketPage />} />
              <Route path="/share" element={<SharePage />} />
              <Route path="/export" element={<ExportPage />} />
              <Route path="/visits" element={<VisitsPage />} />
              <Route path="/visits/:id" element={<VisitPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/messages/:threadId" element={<ThreadPage />} />
              <Route path="/book/:spId" element={<BookPage />} />
              <Route path="/providers" element={<ProvidersPage />} />
              <Route path="/providers/:spId" element={<ProviderPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/sp" element={<SpGate><SpToday /></SpGate>} />
              <Route path="/sp/schedule" element={<SpGate><SpSchedule /></SpGate>} />
              <Route path="/sp/clients" element={<SpGate><SpClients /></SpGate>} />
              <Route path="/sp/clients/:clientId" element={<SpGate><SpClient /></SpGate>} />
              <Route path="/sp/payments" element={<SpGate><SpPayments /></SpGate>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </ToastProvider>
      </StoreProvider>
    </HashRouter>
  );
}
