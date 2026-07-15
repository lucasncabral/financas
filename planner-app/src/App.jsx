import { useEffect, useState } from 'react';
import HomeScreen from './components/HomeScreen';
import ProjectView from './components/ProjectView';
import './index.css';

function parseRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash.startsWith('project/')) {
    return { view: 'project', id: hash.slice('project/'.length) };
  }
  return { view: 'home' };
}

export default function App() {
  const [route, setRoute] = useState(parseRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const openProject = (id) => { window.location.hash = `#/project/${id}`; };
  const goHome = () => { window.location.hash = '#/'; };

  if (route.view === 'project') {
    return <ProjectView projectId={route.id} onBack={goHome} />;
  }
  return <HomeScreen onOpenProject={openProject} />;
}
