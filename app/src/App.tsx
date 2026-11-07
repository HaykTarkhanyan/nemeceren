import { content } from './content/load.ts'
import { AuthGate } from './components/AuthGate.tsx'
import { GoalToast } from './components/GoalToast.tsx'
import { ErrorBanner, ErrorBoundary, GuestBanner, Header, VoiceWarning } from './components/Chrome.tsx'
import { useRoute } from './lib/router.ts'
import { DailyPage } from './pages/DailyPage.tsx'
import { ExtrasPage } from './pages/ExtrasPage.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { LessonPage, LessonsPage } from './pages/LessonsPage.tsx'
import { ListenPage } from './pages/ListenPage.tsx'
import { NotesPage } from './pages/NotesPage.tsx'
import { ResultDetailPage, ResultsPage } from './pages/ResultsPage.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'
import { StatsPage } from './pages/StatsPage.tsx'
import { TestPage } from './pages/TestPage.tsx'
import { TopicsPage } from './pages/TopicsPage.tsx'
import { WordsPage } from './pages/WordsPage.tsx'

function ContentProblems({ problems }: { problems: string[] }) {
  return (
    <main className="container stack">
      <h1>Content has errors</h1>
      <p>The app will not start until these are fixed. Run "npm run check-content" in app/ to get the same list.</p>
      <pre className="pre alert error">{problems.join('\n')}</pre>
    </main>
  )
}

function Page({ route }: { route: string[] }) {
  const [section, arg, sub, subArg] = route
  switch (section ?? '') {
    case '':
      return <HomePage />
    case 'line':
      // "Back to the line" after a station: Home, scrolled to the current station.
      return <HomePage scrollToCurrent />
    case 'daily':
      return <DailyPage sub={arg} />
    case 'test':
      return <TestPage id={arg ?? ''} />
    case 'lessons':
      return <LessonsPage tab={arg} />
    case 'lesson':
      return sub === 'station' ? <LessonPage id={arg ?? ''} station={subArg ?? ''} /> : <LessonPage id={arg ?? ''} sectionId={sub} />
    case 'topics':
      return <TopicsPage />
    case 'extras':
      return <ExtrasPage />
    case 'notes':
      return <NotesPage />
    case 'listen':
      return <ListenPage />
    case 'words':
      return <WordsPage tab={arg} />
    case 'results':
      return arg ? <ResultDetailPage id={arg} /> : <ResultsPage />
    case 'stats':
      return <StatsPage />
    case 'settings':
      return <SettingsPage />
    default:
      return <div className="alert error">Unknown page "#/{route.join('/')}".</div>
  }
}

export function App() {
  const route = useRoute()
  if (content.problems.length > 0) return <ContentProblems problems={content.problems} />
  return (
    <>
      <ErrorBanner />
      <AuthGate>
        <Header route={route} />
        <GuestBanner />
        <VoiceWarning />
        <ErrorBoundary>
          <GoalToast />
        </ErrorBoundary>
        <main className="container">
          <ErrorBoundary key={route.join('/')}>
            <Page route={route} />
          </ErrorBoundary>
        </main>
      </AuthGate>
    </>
  )
}
