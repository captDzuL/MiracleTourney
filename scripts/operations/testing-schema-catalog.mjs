// PG18 catalog projection pinned by the Task12 baseline and canonical reference.
export const CATALOG_SQL = `SELECT json_build_object(
    'tables', (SELECT coalesce(json_agg(json_build_object('name', c.relname, 'kind', c.relkind) ORDER BY c.relname), '[]'::json)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')),
    'columns', (SELECT coalesce(json_agg(json_build_object('table', c.relname, 'name', a.attname, 'type', format_type(a.atttypid,a.atttypmod), 'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) ORDER BY c.relname,a.attnum), '[]'::json)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind IN ('r','p')),
    'indexes', (SELECT coalesce(json_agg(json_build_object('name',i.relname,'table',t.relname,'definition',pg_get_indexdef(i.oid),'unique',x.indisunique,'valid',x.indisvalid,'ready',x.indisready,'live',x.indislive) ORDER BY t.relname,i.relname), '[]'::json)
      FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'),
    'constraints', (SELECT coalesce(json_agg(json_build_object('table',r.relname,'name',c.conname,'type',c.contype,'definition',pg_get_constraintdef(c.oid),'deferrable',c.condeferrable,'deferred',c.condeferred,'validated',c.convalidated) ORDER BY r.relname,c.conname), '[]'::json)
      FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public'),
    'enums', (SELECT coalesce(json_agg(json_build_object('name',t.typname,'labels',(SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid)) ORDER BY t.typname), '[]'::json)
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e'),
    'triggers', (SELECT coalesce(json_agg(json_build_object('table',r.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) ORDER BY r.relname,t.tgname), '[]'::json)
      FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),
    'functions', (SELECT coalesce(json_agg(json_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid)) ORDER BY p.proname), '[]'::json)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
  )`;
