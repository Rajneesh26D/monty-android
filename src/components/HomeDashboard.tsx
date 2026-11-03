import {
  ArrowUpRight,
  BookOpen,
  Calculator,
  Check,
  ClipboardList,
  FileText,
  Folder,
  NotebookPen,
  Pin,
} from 'lucide-react';
import type { State } from '../../shared/types';
import type { Folder as StudyFolder } from '../../shared/monty';
export function HomeDashboard({
  state,
  onEnglish,
  onMaths,
  onFolder,
}: {
  state: State;
  onEnglish: () => void;
  onMaths: () => void;
  onFolder: (folder: StudyFolder) => void;
}) {
  const w = state.monty!,
    folders = Object.values(w.folders),
    files = Object.values(w.attachments);
  const answers = Object.values(w.practice).reduce(
    (sum, p) => sum + Object.values(p.answers).filter(Boolean).length,
    0,
  );
  const completed =
    Object.values(w.tests).filter((t) => t.latest).length +
    state.tests.filter((t) => t.latest).length;
  const latest = folders
    .map((f) => ({
      ...f,
      last: Math.max(
        f.createdAt,
        ...files
          .filter((a) => a.folderId === f.id)
          .map((a) => w.practice[a.id]?.updatedAt ?? a.createdAt),
      ),
    }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.last - a.last)
    .slice(0, 6);
  return (
    <div className="home-dashboard">
      <section className="dashboard-hero">
        <div className="hero-copy">
          <span className="dashboard-kicker">
            <span />
            YOUR STUDY SPACE
          </span>
          <h1>What shall we study?</h1>
          <p>
            Your notes, practice questions and timed tests.
            <br />
            Pick a topic and make it yours.
          </p>
          <div className="hero-meta">
            <Check size={15} />
            Your progress saves as you go
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="hero-circle" />
          <div className="hero-notebook">
            <NotebookPen size={66} />
            <div />
            <div />
            <div />
          </div>
          <span className="hero-tag">
            <Check size={14} />A little better, every day
          </span>
        </div>
      </section>
      <div className="dashboard-stats">
        {[
          [Folder, folders.length, 'Study topics'],
          [FileText, files.length + state.documents.length, 'Files in your library'],
          [Check, answers, 'Practice answers saved'],
          [ClipboardList, completed, 'Tests completed'],
        ].map(([Icon, count, label]: any) => (
          <div className="dashboard-stat" key={label}>
            <span className="stat-icon">
              <Icon size={19} />
            </span>
            <div>
              <strong>{count}</strong>
              <span>{label}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-section-heading">
        <div>
          <span className="eyebrow">PICK YOUR PATH</span>
          <h2>Choose your subject.</h2>
        </div>
        <p>Notes, practice and tests. All together.</p>
      </div>
      <div className="subject-grid dashboard-subjects">
        <button className="subject-card english" onClick={onEnglish}>
          <span className="subject-symbol">
            <BookOpen size={29} />
          </span>
          <span>
            <small>WORDS & IDEAS</small>
            <strong>English</strong>
            <p>Grammar, vocabulary & reading</p>
          </span>
          <ArrowUpRight className="subject-arrow" size={23} />
        </button>
        <button className="subject-card maths" onClick={onMaths}>
          <span className="subject-symbol">
            <Calculator size={29} />
          </span>
          <span>
            <small>NUMBERS & REASONING</small>
            <strong>Maths</strong>
            <p>Notes, practice & timed tests</p>
          </span>
          <ArrowUpRight className="subject-arrow" size={23} />
        </button>
      </div>
      {latest.length > 0 && (
        <section className="dashboard-topics">
          <div className="dashboard-section-heading">
            <div>
              <span className="eyebrow">YOUR LIBRARY</span>
              <h2>Your topics, a tap away.</h2>
            </div>
          </div>
          <div className="recent-topic-grid">
            {latest.map((f) => (
              <button className="recent-topic" key={f.id} onClick={() => onFolder(f)}>
                <span className="recent-topic-icon">
                  {f.area === 'maths' ? <Calculator size={21} /> : <BookOpen size={21} />}
                </span>
                <div>
                  <strong>{f.name}</strong>
                  <small>
                    {f.area === 'maths'
                      ? 'Mathematics'
                      : f.area === 'vocab'
                        ? 'Vocabulary'
                        : f.area === 'grammar'
                          ? 'Grammar'
                          : 'Reading'}
                    <span>·</span>
                    {files.filter((a) => a.folderId === f.id).length +
                      state.documents.filter((d) => d.folderId === f.id).length}{' '}
                    files
                  </small>
                </div>
                {f.pinned ? <Pin size={15} /> : <ArrowUpRight size={17} />}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
