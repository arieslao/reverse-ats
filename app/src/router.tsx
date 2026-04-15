import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Feed } from './pages/Feed'
import { Pipeline } from './pages/Pipeline'
import { Admin } from './pages/Admin'
import { Analytics } from './pages/Analytics'

export function Router() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/feed" replace />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/analytics" element={<Analytics />} />
      </Route>
    </Routes>
  )
}
