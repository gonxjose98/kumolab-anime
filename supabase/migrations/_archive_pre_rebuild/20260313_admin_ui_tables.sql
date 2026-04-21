-- ============================================================
-- KumoLab Admin UI: Tasks, Agents, Activity Log
-- ============================================================

-- 1. Agents Registry
CREATE TABLE IF NOT EXISTS agents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    specialization TEXT NOT NULL,
    avatar_color TEXT NOT NULL DEFAULT '#00d4ff',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default agents
INSERT INTO agents (name, specialization, avatar_color) VALUES
    ('Jarvis', 'Full-stack development, UI/UX implementation, system architecture', '#00d4ff'),
    ('Oracle', 'Strategic planning, task analysis, workflow optimization', '#ff3cac'),
    ('Scraper', 'Content detection, RSS/YouTube/Newsroom scanning, data ingestion', '#7b61ff'),
    ('Publisher', 'Scheduled post publishing, social media distribution', '#00ff88')
ON CONFLICT (name) DO NOTHING;

-- 2. Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog'
        CHECK (status IN ('recurring', 'backlog', 'in_progress', 'review', 'completed')),
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    assigned_to UUID REFERENCES agents(id) ON DELETE SET NULL,
    due_date TIMESTAMPTZ,
    completed_by TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);

-- 3. Agent Activity Log
CREATE TABLE IF NOT EXISTS agent_activity_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_name TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    related_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    related_post_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_agent ON agent_activity_log(agent_name);
CREATE INDEX idx_activity_created ON agent_activity_log(created_at DESC);

-- RLS (permissive for admin)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on agents" ON agents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on agent_activity_log" ON agent_activity_log FOR ALL USING (true) WITH CHECK (true);
