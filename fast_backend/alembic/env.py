from logging.config import fileConfig

from alembic import context
from geoalchemy2 import alembic_helpers
from sqlalchemy import engine_from_config, pool

from app.conf.settings import settings
from app.database.models import Base  # noqa: F401  (registers every model on Base.metadata)

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_SYNC_URL.replace("%", "%%"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Tables & schemas created by the PostGIS image extensions, not by our models.
_POSTGIS_TABLES = frozenset({
    'spatial_ref_sys', 'topology', 'layer',
    'geocode_settings', 'geocode_settings_default', 'pagc_lex', 'pagc_rules', 'pagc_gaz',
    'loader_variables', 'loader_platform', 'loader_lookuptables',
    'street_type_lookup', 'direction_lookup', 'secondary_unit_lookup',
    'state_lookup', 'county_lookup', 'countysub_lookup', 'place_lookup',
    'zip_state', 'zip_state_loc', 'zip_lookup', 'zip_lookup_base', 'zip_lookup_all',
    'addr', 'addrfeat', 'bg', 'county', 'cousub', 'edges', 'faces', 'featnames',
    'place', 'state', 'tabblock', 'tabblock20', 'tract', 'zcta5',
})
_EXCLUDED_SCHEMAS = frozenset({'tiger', 'tiger_data', 'topology'})


def include_object(object, name, type_, reflected, compare_to):
    if type_ == "table" and (getattr(object, 'schema', None) in _EXCLUDED_SCHEMAS or name in _POSTGIS_TABLES):
        return False
    return alembic_helpers.include_object(object, name, type_, reflected, compare_to)


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
        render_item=alembic_helpers.render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            process_revision_directives=alembic_helpers.writer,
            render_item=alembic_helpers.render_item,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
