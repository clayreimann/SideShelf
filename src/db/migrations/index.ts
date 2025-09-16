import * as m0000 from './0000_initial';
import * as m0001 from './0001_user_perms_libs_progress';

// Config expected by Expo SQLite migrator
const migrations = {
  journal: { entries: [] as { idx: number; when: number; tag: string; breakpoints: boolean }[] },
  migrations: {
    [m0000.id]: m0000.queries.join('\n'),
    [m0001.id]: m0001.queries.join('\n'),
  } as Record<string, string>,
};

export default migrations;
