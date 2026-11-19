import { lazy, Suspense } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom'

import CampAdminRoute from './components/CampAdminRoute'
import AdminOnlyRoute from './components/AdminOnlyRoute'
import RequireActiveCamp from './components/RequireActiveCamp'
import PageMetadata from './components/PageMetadata'
import RouteNavigation from './components/RouteNavigation'

const PublicCampRanking = lazy(() => import('./pages/PublicCampRanking'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Gestor = lazy(() => import('./pages/Gestor'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Admin = lazy(() => import('./pages/Admin'))
const Account = lazy(() => import('./pages/Account'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const Camps = lazy(() => import('./pages/Camps'))
const Organizations = lazy(() => import('./pages/Organizations'))
const Users = lazy(() => import('./pages/Users'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const CampGroups = lazy(() => import('./pages/CampGroups'))
const CompetitionTeams = lazy(() => import('./pages/CompetitionTeams'))
const Participants = lazy(() => import('./pages/Participants'))
const Scores = lazy(() => import('./pages/Scores'))
const History = lazy(() => import('./pages/History'))
const Export = lazy(() => import('./pages/Export'))
const Gymkhana = lazy(() => import('./pages/Gymkhana'))
const Inspections = lazy(() => import('./pages/Inspections'))

function RouteLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 text-white">
      <p className="text-sm text-zinc-400">Carregando...</p>
    </main>
  )
}

function LegacyCampAdminRedirect() {
  const { campSlug = '' } = useParams()
  const location = useLocation()
  const legacyPrefix = `/${campSlug}/admin`
  const routeSuffix = location.pathname.startsWith(legacyPrefix)
    ? location.pathname.slice(legacyPrefix.length)
    : ''

  return (
    <Navigate
      to={`/${campSlug}/gestor${routeSuffix}${location.search}${location.hash}`}
      replace
    />
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteNavigation />
      <PageMetadata />
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />

        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Register />} />

        <Route path="/solicitar-acesso" element={<Navigate to="/cadastro" replace />} />

        <Route path="/convite/:token" element={<Navigate to="/cadastro" replace />} />

        <Route path="/recuperar-senha" element={<ForgotPassword />} />
        <Route
          path="/forgot-password"
          element={<Navigate to="/recuperar-senha" replace />}
        />

        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route
          path="/reset-password"
          element={<Navigate to="/redefinir-senha" replace />}
        />

        <Route path="/admin" element={<Admin />}>
          <Route
            index
            element={
              <AdminOnlyRoute redirectGestorTo="/admin/acampamentos">
                <AdminDashboard />
              </AdminOnlyRoute>
            }
          />
          <Route path="conta" element={<Account />} />
          <Route
            path="solicitacoes"
            element={
              <AdminOnlyRoute>
                <Navigate to="/admin/usuarios" replace />
              </AdminOnlyRoute>
            }
          />
          <Route
            path="usuarios"
            element={
              <AdminOnlyRoute>
                <Users />
              </AdminOnlyRoute>
            }
          />
          <Route
            path="convites"
            element={
              <AdminOnlyRoute>
                <Navigate to="/admin/usuarios" replace />
              </AdminOnlyRoute>
            }
          />
          <Route path="acampamentos" element={<Camps />} />
          <Route path="organizacoes" element={<Organizations />} />
          <Route
            path="organizacoes/:organizationId/membros"
            element={<Navigate to="/admin/organizacoes" replace />}
          />
          <Route
            path="account"
            element={<Navigate to="/admin/conta" replace />}
          />
          {/* Legacy compatibility for /admin/tribos. */}
          <Route path="tribos" element={<Navigate to="/admin/quartos" replace />} />
          <Route
            path="equipes"
            element={
              <RequireActiveCamp>
                <CompetitionTeams />
              </RequireActiveCamp>
            }
          />
          <Route
            path="quartos"
            element={
              <RequireActiveCamp>
                <CampGroups />
              </RequireActiveCamp>
            }
          />
          <Route path="times" element={<Navigate to="/admin/equipes" replace />} />
          <Route
            path="participantes"
            element={
              <RequireActiveCamp>
                <Participants />
              </RequireActiveCamp>
            }
          />
          <Route
            path="pontuacao"
            element={
              <RequireActiveCamp>
                <Scores />
              </RequireActiveCamp>
            }
          />
          <Route
            path="historico"
            element={
              <RequireActiveCamp>
                <History />
              </RequireActiveCamp>
            }
          />
          <Route
            path="exportacao"
            element={
              <RequireActiveCamp>
                <Export />
              </RequireActiveCamp>
            }
          />
          <Route
            path="gincana"
            element={
              <RequireActiveCamp>
                <Gymkhana />
              </RequireActiveCamp>
            }
          />
          <Route
            path="inspecoes"
            element={
              <RequireActiveCamp>
                <Inspections />
              </RequireActiveCamp>
            }
          />
        </Route>

        <Route path="/gestor" element={<Gestor />} />

        <Route path="/:campSlug/gestor" element={<CampAdminRoute />}>
          <Route index element={<Dashboard />} />
          <Route path="conta" element={<Account />} />
          <Route path="equipes" element={<CompetitionTeams />} />
          <Route path="quartos" element={<CampGroups />} />
          <Route path="times" element={<Navigate to="../equipes" replace />} />
          <Route path="tribos" element={<Navigate to="../quartos" replace />} />
          <Route path="participantes" element={<Participants />} />
          <Route path="pontuacao" element={<Scores />} />
          <Route path="historico" element={<History />} />
          <Route path="gincana" element={<Gymkhana />} />
          <Route path="inspecoes" element={<Inspections />} />
          <Route path="exportacao" element={<Export />} />
        </Route>

        <Route path="/:campSlug/admin/*" element={<LegacyCampAdminRedirect />} />

        <Route path="/:campSlug" element={<PublicCampRanking />} />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
