import type { Core } from '@strapi/strapi';

import type { DataMigration } from './runner';

const SHOWCASE_ROUTE_PATH = '/showcase';

const migration: DataMigration = {
  name: '009-showcase-page',

  async up(strapi) {
    const existingRoute = await strapi.db.query('api::route.route').findOne({
      where: { path: SHOWCASE_ROUTE_PATH },
    });
    if (existingRoute) {
      strapi.log.info('[data-migrations] Showcase route already exists — skipping.');
      return;
    }

    // ── Supporting entities ──────────────────────────────────────────

    const staff1 = await strapi.documents('api::staff.staff').create({
      data: {
        nombre: 'Dra. María Elena Vásquez',
        cargo: 'Decana',
        descripcion:
          'Doctora en Cirugía Dental con más de 20 años de experiencia en docencia universitaria.',
        contacto: {
          email: 'maria.vasquez@ues.edu.sv',
          telefono: '2225-1234',
          horario: 'Lunes a Viernes, 8:00 AM - 4:00 PM',
          ubicacion: 'Edificio principal, oficina 201',
        },
        cv: [
          {
            tipo: 'academico',
            titulo: 'Doctorado en Cirugía Dental',
            institucion: 'Universidad de El Salvador',
            fecha_inicio: '2000-01-15',
          },
        ],
      } as never,
      status: 'published',
    });

    const staff2 = await strapi.documents('api::staff.staff').create({
      data: {
        nombre: 'Dr. Carlos Alberto Mendoza',
        cargo: 'Vicedecano',
        descripcion:
          'Especialista en Ortodoncia y coordinador de programas de posgrado.',
        contacto: {
          email: 'carlos.mendoza@ues.edu.sv',
          telefono: '2225-5678',
          horario: 'Lunes a Viernes, 8:00 AM - 12:00 PM',
          ubicacion: 'Edificio principal, oficina 203',
        },
        cv: [
          {
            tipo: 'profesional',
            titulo: 'Especialidad en Ortodoncia',
            institucion: 'Universidad Autónoma de México',
            fecha_inicio: '2005-03-01',
            fecha_fin: '2008-12-15',
          },
        ],
      } as never,
      status: 'published',
    });

    const orgUnit = await strapi
      .documents('api::organizational-unit.organizational-unit')
      .create({
        data: {
          nombre: 'Decanato de Odontología',
          tipo: 'decanato',
          descripcion:
            'Unidad administrativa encargada de la gestión académica de la Facultad.',
          miembros: {
            connect: [
              { documentId: staff1.documentId },
              { documentId: staff2.documentId },
            ],
          },
        } as never,
        status: 'published',
      });

    const form = await strapi.documents('api::form.form').create({
      data: {
        title: 'Formulario de Contacto (Showcase)',
        description:
          'Formulario de prueba para el showcase de componentes.',
        submit_label: 'Enviar mensaje',
        success_message:
          '¡Gracias! Tu mensaje ha sido enviado correctamente.',
        error_message:
          'Hubo un error al enviar tu mensaje. Inténtalo de nuevo.',
        fields: [
          {
            name: 'nombre_completo',
            label: 'Nombre completo',
            field_type: 'text',
            required: true,
            placeholder: 'Ej. Juan Pérez',
          },
          {
            name: 'correo',
            label: 'Correo electrónico',
            field_type: 'email',
            required: true,
            placeholder: 'ejemplo@ues.edu.sv',
          },
          {
            name: 'telefono',
            label: 'Teléfono',
            field_type: 'tel',
            required: false,
            placeholder: '2225-0000',
          },
          {
            name: 'asunto',
            label: 'Asunto',
            field_type: 'select',
            required: true,
            options: 'Consulta general\nAdmisión\nServicios clínicos\nOtro',
          },
          {
            name: 'mensaje',
            label: 'Mensaje',
            field_type: 'textarea',
            required: true,
            placeholder: 'Escribe tu mensaje aquí...',
            min_length: 10,
            max_length: 500,
          },
        ],
        email_to: 'contacto@odontologia.ues.edu.sv',
      } as never,
      status: 'published',
    });

    const blockGroup1 = await strapi
      .documents('api::block-group.block-group')
      .create({
        data: {
          name: 'Showcase - Grupo A',
          group_columns: 6,
          blocks: [
            {
              __component: 'blocks.info-card',
              title: 'Tarjeta en sección (A)',
              body: 'Esta tarjeta está dentro de un **block-group** anidado en una sección.',
            },
            {
              __component: 'blocks.bullet-list',
              title: 'Lista anidada',
              items: [
                { text: 'Elemento anidado 1' },
                { text: 'Elemento anidado 2' },
              ],
            },
          ],
        } as never,
        status: 'published',
      });

    const blockGroup2 = await strapi
      .documents('api::block-group.block-group')
      .create({
        data: {
          name: 'Showcase - Grupo B',
          group_columns: 6,
          blocks: [
            {
              __component: 'blocks.rich-text',
              content:
                '## Contenido anidado\n\nEste bloque de texto enriquecido está dentro de una sección, demostrando el **anidamiento** de bloques mediante `block-group`.',
            },
          ],
        } as never,
        status: 'published',
      });

    // ── Route ────────────────────────────────────────────────────────

    const route = await strapi.db.query('api::route.route').create({
      data: {
        path: SHOWCASE_ROUTE_PATH,
        label: 'Showcase',
        type: 'page',
        order: 99,
        active: true,
        visibility: 'public',
      },
    });

    // ── Page with all blocks ─────────────────────────────────────────

    const content = [
      {
        __component: 'blocks.hero-landing',
        title: 'Showcase de Componentes SDUI',
        subtitle:
          'Todos los bloques disponibles en el CMS, renderizados a través del pipeline SDUI.',
        buttons: [
          {
            label: 'Explorar',
            url: '#contenido',
            variant: 'variant-filled-primary',
          },
          {
            label: 'Documentación',
            url: '#docs',
            variant: 'variant-ghost-primary',
          },
        ],
      },

      {
        __component: 'blocks.hero-page',
        title: 'Hero de Página Interna',
        subtitle:
          'Variante de hero para páginas secundarias con gradiente.',
        gradient: 'primary',
      },

      {
        __component: 'blocks.rich-text',
        content:
          '## Texto Enriquecido\n\nEste es un bloque de **texto enriquecido** que soporta formato _Markdown_.\n\n- Elemento de lista 1\n- Elemento de lista 2\n- Elemento de lista 3\n\n> Las citas también funcionan en este bloque.\n\n### Subtítulo\n\nPárrafo adicional con un [enlace de ejemplo](#) para demostrar el formato completo.',
      },

      {
        __component: 'blocks.content-grid',
        title: 'Cuadrícula de Contenido',
        card_style: 'default',
        columns: 'col_3',
        items: [
          {
            title: 'Programa de Odontología General',
            description:
              'Formación integral en ciencias de la salud oral con énfasis en prevención y tratamiento.',
            tag: 'Pregrado',
            url: '#',
          },
          {
            title: 'Especialización en Ortodoncia',
            description:
              'Posgrado con enfoque en corrección de maloclusiones y alineación dental.',
            tag: 'Posgrado',
            url: '#',
          },
          {
            title: 'Diplomado en Endodoncia',
            description:
              'Programa de educación continua para profesionales en ejercicio.',
            tag: 'Educación Continua',
            url: '#',
          },
        ],
      },

      {
        __component: 'blocks.quick-links',
        title: 'Enlaces Rápidos',
        ql_columns: 4,
        links: [
          {
            label: 'Admisión',
            url: '#',
            icon: 'graduation-cap',
            description: 'Información sobre el proceso de admisión.',
          },
          {
            label: 'Horarios',
            url: '#',
            icon: 'clock',
            description: 'Consulta los horarios de clase.',
          },
          {
            label: 'Biblioteca',
            url: '#',
            icon: 'book-open',
            description: 'Accede al catálogo en línea.',
          },
          {
            label: 'Campus Virtual',
            url: '#',
            icon: 'monitor',
            description: 'Plataforma de aprendizaje en línea.',
          },
        ],
      },

      {
        __component: 'blocks.timeline',
        title: 'Historia de la Facultad',
        items: [
          {
            year: '1960',
            title: 'Fundación',
            description:
              'Se establece la Facultad de Odontología en la Universidad de El Salvador.',
          },
          {
            year: '1985',
            title: 'Primer posgrado',
            description:
              'Se inaugura el programa de especialización en Cirugía Oral.',
          },
          {
            year: '2005',
            title: 'Modernización',
            description:
              'Renovación completa de las clínicas de atención al paciente.',
          },
          {
            year: '2020',
            title: 'Acreditación internacional',
            description:
              'La facultad obtiene reconocimiento de calidad por organismos internacionales.',
          },
        ],
      },

      {
        __component: 'blocks.mission-vision',
        mission_title: 'Misión',
        mission_text:
          'Formar profesionales en odontología con excelencia académica, ética y compromiso social, contribuyendo a la salud oral de la población salvadoreña.',
        vision_title: 'Visión',
        vision_text:
          'Ser referente centroamericano en educación odontológica, investigación y servicio comunitario, con estándares internacionales de calidad.',
      },

      {
        __component: 'blocks.process-steps',
        title: 'Proceso de Admisión',
        steps: [
          {
            number: 1,
            title: 'Registro en línea',
            description:
              'Completa el formulario de pre-inscripción en el portal académico.',
            icon: 'clipboard-list',
          },
          {
            number: 2,
            title: 'Examen de admisión',
            description:
              'Presenta la prueba de conocimientos generales y aptitudes.',
            icon: 'file-text',
          },
          {
            number: 3,
            title: 'Entrevista',
            description:
              'Asiste a la entrevista con el comité de selección.',
            icon: 'users',
          },
          {
            number: 4,
            title: 'Matrícula',
            description:
              'Formaliza tu inscripción en las oficinas de la facultad.',
            icon: 'check-circle',
          },
        ],
      },

      {
        __component: 'blocks.cta',
        title: '¿Listo para iniciar tu carrera en Odontología?',
        description:
          'Descubre todos los programas que tenemos para ti y da el primer paso hacia tu futuro profesional.',
        buttons: [
          {
            label: 'Conocer programas',
            url: '#',
            variant: 'variant-filled-primary',
          },
          {
            label: 'Contactar asesor',
            url: '#',
            variant: 'variant-ringed-primary',
          },
        ],
      },

      {
        __component: 'blocks.calendar',
        title: 'Calendario Académico',
        items: [
          {
            date: '2026-08-01',
            title: 'Inicio del ciclo II-2026',
            category: 'academic',
          },
          {
            date: '2026-08-15',
            title: 'Jornada de bienvenida',
            description:
              'Actividades de integración para estudiantes de nuevo ingreso.',
            category: 'event',
          },
          {
            date: '2026-09-15',
            title: 'Fecha límite de retiro',
            description:
              'Último día para retiro extraordinario de materias.',
            category: 'deadline',
          },
          {
            date: '2026-10-01',
            title: 'Día del odontólogo',
            description:
              'Celebración con actividades académicas y culturales.',
            category: 'holiday',
          },
        ],
      },

      {
        __component: 'blocks.map',
        title: 'Ubicación de la Facultad',
        address:
          'Final 25 Avenida Norte, Ciudad Universitaria, San Salvador, El Salvador',
        embed_url:
          'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3876.0!2d-89.2!3d13.72!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTPCsDQzJzEyLjAiTiA4OcKwMTInMDAuMCJX!5e0!3m2!1ses!2ssv!4v1',
        latitude: 13.72,
        longitude: -89.2,
      },

      {
        __component: 'blocks.staff-section',
        titulo: 'Equipo Directivo',
        unidad: orgUnit.documentId,
      },

      {
        __component: 'blocks.bullet-list',
        title: 'Servicios Disponibles',
        items: [
          { text: 'Consulta odontológica general' },
          { text: 'Limpieza dental y profilaxis' },
          { text: 'Tratamientos de ortodoncia' },
          { text: 'Cirugía oral menor' },
          { text: 'Radiografías panorámicas y periapicales' },
        ],
        cta: {
          label: 'Agendar cita',
          url: '#',
          variant: 'variant-filled-secondary',
        },
      },

      {
        __component: 'blocks.key-dates',
        title: 'Fechas Importantes',
        display_mode: 'list',
        items: [
          {
            start_date: '2026-07-15',
            end_date: '2026-07-30',
            label: 'Período de inscripción',
            description: 'Inscripción para el ciclo II-2026.',
          },
          {
            start_date: '2026-08-01',
            label: 'Inicio de clases',
            description: 'Primer día del ciclo académico.',
          },
          {
            start_date: '2026-11-20',
            end_date: '2026-12-10',
            label: 'Evaluaciones finales',
          },
        ],
      },

      {
        __component: 'blocks.info-card',
        title: 'Clínicas de Atención al Público',
        body: 'Las clínicas de la Facultad de Odontología ofrecen servicios de salud oral a **precios accesibles** para la comunidad universitaria y público en general.\n\nAtención de lunes a viernes en horario de 8:00 AM a 3:00 PM.',
        cta: {
          label: 'Más información',
          url: '#',
          variant: 'variant-soft-primary',
        },
      },

      {
        __component: 'blocks.clinic-schedule',
        clinic_name: 'Clínica de Odontología General',
        hours: [
          { day_range: 'Lunes a Viernes', time_range: '8:00 AM - 3:00 PM' },
          { day_range: 'Sábados', time_range: '8:00 AM - 12:00 PM' },
        ],
        schedule_text:
          'Las citas se programan con **48 horas de anticipación**. Presentarse 15 minutos antes de la hora asignada.',
      },

      {
        __component: 'blocks.icon-strip',
        title: 'Áreas de Especialización',
        links: [
          { label: 'Ortodoncia', icon: 'smile', url: '#' },
          { label: 'Endodoncia', icon: 'syringe', url: '#' },
          { label: 'Periodoncia', icon: 'heart-pulse', url: '#' },
          { label: 'Cirugía Oral', icon: 'scissors', url: '#' },
        ],
      },

      {
        __component: 'blocks.map-schedule',
        clinic_name: 'Clínica de Imagenología 3D',
        address: 'Edificio de Clínicas, 2do nivel, Ciudad Universitaria',
        embed_url:
          'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3876.0!2d-89.2!3d13.72!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTPCsDQzJzEyLjAiTiA4OcKwMTInMDAuMCJX!5e0!3m2!1ses!2ssv!4v1',
        hours: [
          {
            day_range: 'Lunes a Viernes',
            time_range: '7:30 AM - 4:00 PM',
          },
        ],
        schedule_text:
          'Servicio de tomografías y radiografías digitales disponible **con cita previa**.',
      },

      {
        __component: 'blocks.section',
        name: 'Sección con bloques anidados',
        section_columns: 12,
        children: {
          connect: [
            { documentId: blockGroup1.documentId },
            { documentId: blockGroup2.documentId },
          ],
        },
      },

      {
        __component: 'blocks.form',
        title: 'Contáctanos',
        submit_label: 'Enviar mensaje',
        form: form.documentId,
      },

      {
        __component: 'blocks.magazine-archive',
        title: 'Publicaciones de la Facultad',
      },

      {
        __component: 'blocks.accordion',
        title: 'Preguntas Frecuentes',
        items: [
          {
            label: '¿Cuáles son los requisitos de admisión?',
            content:
              'Los aspirantes deben haber aprobado el bachillerato general o técnico vocacional y presentar la prueba de admisión de la UES. Además, se requiere:\n\n- Título de bachiller autenticado\n- Certificado de notas\n- Partida de nacimiento\n- Fotografías tamaño cédula',
          },
          {
            label: '¿Cuánto dura la carrera?',
            content:
              'El plan de estudios de la Licenciatura en Cirugía Dental tiene una duración de **5 años** (10 ciclos académicos), más un año de servicio social obligatorio.',
          },
          {
            label: '¿Ofrecen servicios al público?',
            content:
              'Sí, las clínicas de la facultad ofrecen atención odontológica a precios accesibles. Los servicios incluyen consulta general, limpiezas, extracciones, ortodoncia y más.',
          },
        ],
      },

      {
        __component: 'blocks.tabs',
        title: 'Información por Área',
        items: [
          {
            label: 'Pregrado',
            content:
              '## Licenciatura en Cirugía Dental\n\nEl programa de pregrado forma profesionales con competencias en:\n\n- Diagnóstico y tratamiento de enfermedades bucales\n- Prevención y promoción de la salud oral\n- Investigación científica aplicada',
          },
          {
            label: 'Posgrado',
            content:
              '## Programas de Especialización\n\nLa facultad ofrece programas de posgrado en las principales áreas de la odontología:\n\n- Ortodoncia\n- Endodoncia\n- Periodoncia\n- Cirugía Oral y Maxilofacial',
          },
          {
            label: 'Investigación',
            content:
              '## Centro de Investigaciones\n\nEl centro promueve la investigación en salud oral con líneas de trabajo en:\n\n- Epidemiología oral\n- Biomateriales dentales\n- Salud pública odontológica',
          },
        ],
      },

      {
        __component: 'blocks.carousel',
        title: 'Galería de la Facultad',
        slides: [],
        autoplay: false,
      },

      {
        __component: 'blocks.table',
        title: 'Aranceles de Servicios Clínicos',
        description:
          'Precios referenciales para servicios de atención odontológica en las clínicas de la facultad.',
        data: {
          headers: ['Servicio', 'Precio (USD)', 'Duración aprox.'],
          rows: [
            ['Consulta general', '$5.00', '30 min'],
            ['Limpieza dental', '$8.00', '45 min'],
            ['Extracción simple', '$3.00', '20 min'],
            ['Radiografía periapical', '$2.00', '10 min'],
            ['Aplicación de flúor', '$3.00', '15 min'],
          ],
        },
      },

      {
        __component: 'blocks.photo-gallery',
        title: 'Galería Fotográfica',
        subtitle:
          'Instalaciones y actividades de la Facultad de Odontología.',
        photo_columns: 'col_3',
      },
    ];

    await strapi.documents('api::page.page').create({
      data: {
        title: 'Showcase de Componentes',
        layout: 'full-width',
        route: route.documentId,
        content,
      } as never,
      status: 'published',
    });

    strapi.log.info(
      `[data-migrations] Showcase page created at ${SHOWCASE_ROUTE_PATH}.`
    );
  },
};

export default migration;
