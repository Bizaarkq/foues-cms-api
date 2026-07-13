/**
 * Guía del editor — documentación de campos, fuente de verdad versionada.
 *
 * Este contenido reemplaza los tooltips del ex-plugin superfields: acá vive
 * el "para qué sirve y cómo se usa" de cada campo que ve el editor. Al
 * agregar o cambiar campos en un schema, actualizá la entrada correspondiente.
 */

export interface FieldDoc {
  name: string;
  label: string;
  help: string;
  values?: string[];
}

export interface EntryDoc {
  title: string;
  description: string;
  fields: FieldDoc[];
}

export interface SectionDoc {
  title: string;
  entries: EntryDoc[];
}

export const FIELDS_DOC: SectionDoc[] = [
  {
    title: "Bloques de página",
    entries: [
      {
        title: "Bullet List",
        description: "Titled list of bullet points with an optional call-to-action button.",
        fields: [
          {
            name: "title",
            label: "Título de la lista",
            help: "Título de la lista. Se muestra encima de los ítems. Ej: 'Requisitos de ingreso', 'Beneficios'",
          },
        ],
      },
      {
        title: "CTA",
        description: "Call-to-action section with heading, description and action buttons",
        fields: [
          {
            name: "title",
            label: "Título del CTA",
            help: "Título del llamado a la acción. Debe ser directo e invitar al usuario a hacer algo. Ej: '¿Querés estudiar con nosotros?'",
          },
          {
            name: "description",
            label: "Texto de apoyo",
            help: "Texto de apoyo debajo del título. Ampliá brevemente el mensaje antes de los botones",
          },
        ],
      },
      {
        title: "Calendar",
        description: "Academic calendar or events schedule",
        fields: [
          {
            name: "title",
            label: "Título del calendario",
            help: "Título del calendario o cronograma. Ej: 'Calendario académico 2025'",
          },
        ],
      },
      {
        title: "Clinic Schedule",
        description: "Operating hours panel for a clinic with optional richtext footnote",
        fields: [
          {
            name: "clinic_name",
            label: "Nombre de la clínica",
            help: "Nombre de la clínica o servicio. Se muestra como encabezado del horario. Ej: 'Clínica de Odontología'",
          },
        ],
      },
      {
        title: "Content Grid",
        description: "Grid of elements like cards natively inside the page",
        fields: [
          {
            name: "title",
            label: "Título de la sección",
            help: "Título de la sección de tarjetas. Se muestra encima de la grilla",
          },
          {
            name: "collection_type",
            label: "Tipo de colección a mostrar",
            help: "Tipo de contenido que se muestra en la grilla. 'news': noticias · 'events': eventos · 'programs': programas · 'faculty': docentes",
            values: [
              "news",
              "events",
              "programs",
              "faculty",
            ],
          },
          {
            name: "card_style",
            label: "Estilo de las tarjetas",
            help: "Estilo visual de las tarjetas. 'default': estándar · 'compact': más pequeñas · 'featured': destacada grande · 'horizontal': imagen a la izquierda",
            values: [
              "default",
              "compact",
              "featured",
              "horizontal",
            ],
          },
          {
            name: "columns",
            label: "Columnas de la grilla",
            help: "Cantidad de columnas de la grilla. 'col_1': 1 columna · 'col_2': 2 · 'col_3': 3 (recomendado) · 'col_4': 4",
            values: [
              "col_1",
              "col_2",
              "col_3",
              "col_4",
            ],
          },
        ],
      },
      {
        title: "Form Block",
        description: "Bloque SDUI que embebe un formulario dinámico en una página.",
        fields: [
          {
            name: "title",
            label: "Título (sobreescribe el del formulario)",
            help: "Título personalizado para el formulario en esta página. Si se deja vacío, se usa el título definido en el formulario",
          },
          {
            name: "submit_label",
            label: "Texto del botón (sobreescribe el del formulario)",
            help: "Texto personalizado del botón de envío. Si se deja vacío, se usa el texto definido en el formulario. Ej: 'Enviar consulta', 'Inscribirme'",
          },
        ],
      },
      {
        title: "Hero Landing",
        description: "Full-page hero for landing/home pages with prominent CTA buttons",
        fields: [
          {
            name: "title",
            label: "Título principal",
            help: "Título principal que aparece grande en el centro del hero. Es lo primero que ve el visitante",
          },
          {
            name: "subtitle",
            label: "Subtítulo o descripción breve",
            help: "Texto secundario debajo del título. Puede ser un slogan o descripción breve de la página",
          },
        ],
      },
      {
        title: "Hero Page",
        description: "Compact hero for interior pages with title and optional breadcrumb",
        fields: [
          {
            name: "title",
            label: "Título de la página",
            help: "Título de la sección o página interior. Aparece como encabezado compacto",
          },
          {
            name: "subtitle",
            label: "Subtítulo (opcional)",
            help: "Texto complementario debajo del título de la página. Opcional",
          },
          {
            name: "gradient",
            label: "Degradado del fondo",
            help: "Color de degradado superpuesto sobre la imagen de fondo. 'none': sin degradado · 'primary': color primario · 'secondary': color secundario",
            values: [
              "none",
              "primary",
              "secondary",
            ],
          },
        ],
      },
      {
        title: "Icon Strip",
        description: "Compact horizontal row of icon+label items (no card backgrounds)",
        fields: [
          {
            name: "title",
            label: "Título (opcional)",
            help: "Título opcional de la franja de íconos. Se muestra encima de la fila de íconos",
          },
        ],
      },
      {
        title: "Info Card",
        description: "Standalone informational card: title + rich text body + optional CTA.",
        fields: [
          {
            name: "title",
            label: "Título de la tarjeta",
            help: "Título de la tarjeta informativa. Aparece como encabezado del bloque",
          },
        ],
      },
      {
        title: "Key Dates",
        description: "Important dates rendered as a calendar (single month) or chronological list.",
        fields: [
          {
            name: "title",
            label: "Título de la sección",
            help: "Título de la sección de fechas importantes. Ej: 'Fechas de inscripción', 'Calendario de exámenes'",
          },
          {
            name: "display_mode",
            label: "Modo de visualización",
            help: "Cómo se muestran las fechas. 'calendar': vista de calendario mensual · 'list': lista cronológica simple",
            values: [
              "calendar",
              "list",
            ],
          },
        ],
      },
      {
        title: "Magazine Archive",
        description: "Displays the editions archive grid of the selected publications (self-fetching)",
        fields: [
          {
            name: "title",
            label: "Título mostrado sobre la grilla de ediciones",
            help: "Título de la sección del archivo. Ej: 'Revista Estudiantil', 'Informes Científicos'",
          },
        ],
      },
      {
        title: "Map",
        description: "Embedded map with location info and contact details",
        fields: [
          {
            name: "title",
            label: "Título de la sección",
            help: "Título que aparece sobre el mapa. Ej: 'Cómo llegar', 'Nuestra ubicación'",
          },
          {
            name: "address",
            label: "Dirección del lugar",
            help: "Dirección física del lugar. Se muestra como texto debajo del mapa. Ej: 'Av. Rivadavia 1234, Buenos Aires'",
          },
          {
            name: "embed_url",
            label: "URL de Google Maps (src del iframe)",
            help: "URL de incrustación de Google Maps. En Google Maps: Compartir → Insertar un mapa → copiá el valor del atributo src",
          },
        ],
      },
      {
        title: "Map + Schedule",
        description: "Composite block: embedded map (left) + clinic schedule (right) in a 2-column layout",
        fields: [
          {
            name: "clinic_name",
            label: "Nombre de la clínica o sede",
            help: "Nombre de la clínica o sede. Se muestra como encabezado del bloque. Ej: 'Sede Central'",
          },
          {
            name: "address",
            label: "Dirección del lugar",
            help: "Dirección física que aparece debajo del mapa. Ej: 'Av. Rivadavia 1234, Buenos Aires'",
          },
        ],
      },
      {
        title: "Mission Vision",
        description: "Institutional mission and vision statement block",
        fields: [
          {
            name: "mission_title",
            label: "Título del panel de misión",
            help: "Etiqueta del panel de misión. Por defecto 'Misión', pero se puede personalizar",
          },
          {
            name: "mission_text",
            label: "Texto de la misión",
            help: "Texto completo de la misión institucional. Describí el propósito y razón de ser de la organización",
          },
          {
            name: "vision_title",
            label: "Título del panel de visión",
            help: "Etiqueta del panel de visión. Por defecto 'Visión', pero se puede personalizar",
          },
          {
            name: "vision_text",
            label: "Texto de la visión",
            help: "Texto completo de la visión institucional. Describí hacia dónde apunta la organización a futuro",
          },
        ],
      },
      {
        title: "Photo Gallery",
        description: "Grid or masonry layout of images",
        fields: [
          {
            name: "title",
            label: "Título de la galería",
            help: "Título de la galería. Se muestra encima de las fotos",
          },
          {
            name: "subtitle",
            label: "Descripción (opcional)",
            help: "Descripción breve de la galería. Se muestra debajo del título",
          },
          {
            name: "photo_columns",
            label: "Columnas de la galería",
            help: "Cantidad de columnas para mostrar las fotos. 'col_2': 2 columnas · 'col_3': 3 (recomendado) · 'col_4': 4",
            values: [
              "col_2",
              "col_3",
              "col_4",
            ],
          },
        ],
      },
      {
        title: "Process Steps",
        description: "Numbered or ordered sequence of process steps",
        fields: [
          {
            name: "title",
            label: "Título de la sección",
            help: "Título de la sección de pasos. Ej: 'Cómo inscribirse', 'Proceso de admisión'",
          },
        ],
      },
      {
        title: "Quick Links",
        description: "A set of prominent shortcut links for navigation",
        fields: [
          {
            name: "title",
            label: "Título de la sección",
            help: "Título de la sección de accesos rápidos. Se muestra encima de los botones",
          },
          {
            name: "ql_columns",
            label: "Columnas por fila (0 = auto)",
            help: "Columnas por fila (0 = automático, 1–12 = fijo). Ej: 4 muestra 4 elementos por fila en escritorio.",
          },
        ],
      },
      {
        title: "Section",
        description: "Contenedor de block-groups. Permite agrupar bloques en un nivel anidado (máx 2). Usar deep_children solo como escape hatch >2 niveles (sin tipado).",
        fields: [
          {
            name: "name",
            label: "Nombre interno (solo admin)",
            help: "Nombre interno de la sección. Solo visible en el admin, sirve para identificar el contenedor en páginas complejas",
          },
          {
            name: "section_columns",
            label: "Columnas de la grilla (1–12)",
            help: "Columnas de la grilla CSS para esta sección (1–12). Controla el ancho proporcional de los block-groups hijos. Valor por defecto: 12 (ancho completo)",
          },
        ],
      },
      {
        title: "Staff Section",
        description: "Muestra los miembros de una unidad organizacional (autoridades, junta directiva, etc.)",
        fields: [
          {
            name: "titulo",
            label: "Título de la sección",
            help: "Título de la sección de personal. Ej: 'Autoridades', 'Cuerpo docente', 'Junta directiva'",
          },
        ],
      },
      {
        title: "Timeline",
        description: "Chronological list of events or milestones",
        fields: [
          {
            name: "title",
            label: "Título de la sección",
            help: "Título de la línea de tiempo. Se muestra encima de los eventos",
          },
        ],
      },
    ],
  },
  {
    title: "Elementos reutilizables",
    entries: [
      {
        title: "Button",
        description: "Standard action button with link",
        fields: [
          {
            name: "label",
            label: "Texto del botón",
            help: "Texto que aparece dentro del botón. Debe ser una acción clara. Ej: 'Ver más', 'Inscribirme', 'Descargar PDF'",
          },
          {
            name: "url",
            label: "URL de destino",
            help: "Destino del botón al hacer clic. Puede ser relativo ('/contacto') o absoluto ('https://...'). Dejá vacío si el botón no tiene destino todavía",
          },
          {
            name: "variant",
            label: "Estilo visual del botón",
            help: "Estilo visual del botón. 'filled-primary': relleno color principal · 'filled-secondary': relleno secundario · 'ghost-primary': contorno primario · 'ghost-secondary': contorno secundario · 'soft-primary': suave primario · 'ringed-primary': anillo primario",
            values: [
              "variant-filled-primary",
              "variant-filled-secondary",
              "variant-ghost-primary",
              "variant-ghost-secondary",
              "variant-soft-primary",
              "variant-ringed-primary",
            ],
          },
        ],
      },
      {
        title: "Card",
        description: "Card with image, title, and link",
        fields: [
          {
            name: "title",
            label: "Título de la tarjeta",
            help: "Título de la tarjeta. Aparece como encabezado principal de la card",
          },
          {
            name: "description",
            label: "Descripción (opcional)",
            help: "Texto descriptivo que aparece debajo del título de la tarjeta",
          },
          {
            name: "url",
            label: "URL de destino",
            help: "Enlace al que lleva la tarjeta al hacer clic. Puede ser relativo ('/noticias/1') o absoluto ('https://...')",
          },
          {
            name: "tag",
            label: "Etiqueta / badge (opcional)",
            help: "Etiqueta opcional que aparece como badge en la tarjeta. Ej: 'Nuevo', 'Destacado', una categoría",
          },
          {
            name: "customClasses",
            label: "Clases CSS personalizadas (solo técnico)",
            help: "Clases CSS adicionales para personalizar el estilo de la tarjeta. Solo para uso técnico — dejá vacío si no sabés qué es esto",
          },
        ],
      },
      {
        title: "Date Entry",
        description: "A label + date range (single date if end_date is empty). Used by Key Dates.",
        fields: [
          {
            name: "label",
            label: "Nombre de la fecha",
            help: "Nombre de la fecha o período. Ej: 'Inscripción primer cuatrimestre', 'Examen final de Anatomía'",
          },
          {
            name: "description",
            label: "Información adicional (opcional)",
            help: "Información adicional sobre esta fecha. Ej: horarios, lugar, requisitos previos. Opcional",
          },
        ],
      },
      {
        title: "Form Field",
        description: "Campo de formulario dinámico",
        fields: [
          {
            name: "name",
            label: "Identificador único del campo en el formulario",
            help: "Nombre técnico del campo. Sin espacios ni caracteres especiales. Ej: nombre_completo, correo_electronico",
          },
          {
            name: "label",
            label: "Texto visible para el usuario",
            help: "Etiqueta que verá el usuario en el formulario. Ej: Nombre completo, Correo electrónico",
          },
          {
            name: "field_type",
            label: "Tipo de input que se mostrará al usuario",
            help: "text: texto corto · email: correo electrónico con validación · tel: teléfono · number: número · textarea: texto largo · select: lista desplegable · checkbox: casilla de verificación · radio: opción única · date: fecha",
            values: [
              "text",
              "email",
              "tel",
              "number",
              "textarea",
              "select",
              "checkbox",
              "radio",
              "date",
            ],
          },
          {
            name: "required",
            label: "¿Es obligatorio?",
            help: "Si está activo, el usuario no podrá enviar el formulario sin completar este campo",
          },
          {
            name: "placeholder",
            label: "Texto de orientación dentro del input",
            help: "Texto de ejemplo que aparece dentro del campo cuando está vacío. Ej: ejemplo@correo.com",
          },
          {
            name: "help_text",
            label: "Instrucción adicional visible bajo el campo",
            help: "Texto de ayuda que aparece debajo del campo para orientar al usuario. Ej: Ingrese su correo institucional",
          },
          {
            name: "min_length",
            label: "Longitud mínima",
            help: "Mínimo de caracteres requeridos. Solo aplica a campos de tipo texto, email, tel y textarea",
          },
          {
            name: "max_length",
            label: "Longitud máxima",
            help: "Máximo de caracteres permitidos. Solo aplica a campos de tipo texto, email, tel y textarea",
          },
        ],
      },
      {
        title: "List Item",
        description: "Single bullet text. Reusable across any list-shaped block.",
        fields: [
          {
            name: "text",
            label: "Texto del ítem",
            help: "Texto del ítem de lista. Escribí una oración breve por ítem",
          },
        ],
      },
      {
        title: "Quick Link Item",
        description: "Card item for Quick Links block with icon, title and description",
        fields: [
          {
            name: "label",
            label: "Texto del enlace",
            help: "Texto del acceso rápido. Debe ser breve y descriptivo. Ej: 'Inscripción', 'Mesa de ayuda', 'Plan de estudios'",
          },
          {
            name: "url",
            label: "URL de destino",
            help: "Destino del enlace al hacer clic. Puede ser relativo ('/inscripcion') o absoluto ('https://...')",
          },
          {
            name: "description",
            label: "Descripción breve (opcional)",
            help: "Texto de apoyo que aparece debajo del label en la tarjeta. Opcional",
          },
        ],
      },
      {
        title: "Schedule Entry",
        description: "A single clinic schedule row: day range + time range",
        fields: [
          {
            name: "day_range",
            label: "Días de atención",
            help: "Días de atención de esta fila. Ej: 'Lunes a Viernes', 'Sábados', 'Lunes, Miércoles y Viernes'",
          },
          {
            name: "time_range",
            label: "Horario de atención",
            help: "Horario de atención correspondiente a los días indicados. Ej: '8:00 – 17:00', '9:00 – 13:00'",
          },
        ],
      },
      {
        title: "Schedule Item",
        description: "A single entry in an academic calendar or schedule block",
        fields: [
          {
            name: "title",
            label: "Nombre del evento",
            help: "Nombre del evento o actividad del calendario. Ej: 'Inicio de clases', 'Examen parcial'",
          },
          {
            name: "description",
            label: "Información adicional (opcional)",
            help: "Información adicional sobre el evento. Ej: horarios, lugar, instrucciones especiales",
          },
          {
            name: "category",
            label: "Categoría del evento",
            help: "Categoría del evento para filtrado y color visual. 'academic': académico · 'event': evento · 'deadline': fecha límite · 'holiday': feriado · 'other': otro",
            values: [
              "academic",
              "event",
              "deadline",
              "holiday",
              "other",
            ],
          },
        ],
      },
      {
        title: "Step",
        description: "A single numbered step in a process-steps block",
        fields: [
          {
            name: "number",
            label: "Número del paso",
            help: "Número de orden del paso. Determina la secuencia visual (1, 2, 3...)",
          },
          {
            name: "title",
            label: "Título del paso",
            help: "Título corto del paso. Ej: 'Completá el formulario', 'Presentate a la entrevista'",
          },
          {
            name: "description",
            label: "Descripción del paso",
            help: "Explicación detallada del paso. Describí qué tiene que hacer el usuario en esta etapa",
          },
        ],
      },
      {
        title: "Timeline Item",
        description: "A single event or milestone in a timeline block",
        fields: [
          {
            name: "year",
            label: "Año o período",
            help: "Año o fecha del evento en la línea de tiempo. Ej: '1998', '2003–2005'",
          },
          {
            name: "title",
            label: "Título del evento",
            help: "Nombre del hito o evento histórico que se muestra junto al año",
          },
          {
            name: "description",
            label: "Descripción (opcional)",
            help: "Descripción ampliada del evento. Opcional — agregar si el hito necesita más contexto",
          },
        ],
      },
    ],
  },
  {
    title: "Pie de página",
    entries: [
      {
        title: "Footer Column Contact",
        description: "Footer column with contact information",
        fields: [
          {
            name: "heading",
            label: "Título de la columna",
            help: "Título de la columna de contacto. Ej: 'Contacto', 'Dónde encontrarnos'",
          },
          {
            name: "address",
            label: "Dirección física",
            help: "Dirección física completa de la institución. Podés usar saltos de línea para separar calle, ciudad y código postal",
          },
          {
            name: "phone",
            label: "Teléfono de contacto",
            help: "Número de teléfono de contacto con código de área. Ej: '+54 11 4372-0000'",
          },
          {
            name: "email",
            label: "Email de contacto",
            help: "Dirección de correo electrónico de contacto institucional. Ej: 'info@facultad.edu.ar'",
          },
        ],
      },
      {
        title: "Footer Column Institution",
        description: "Logo, institution name, description and social links",
        fields: [
          {
            name: "institution_name",
            label: "Nombre de la institución",
            help: "Nombre completo de la institución tal como aparece en el footer. Ej: 'Facultad de Odontología'",
          },
          {
            name: "sub_name",
            label: "Nombre secundario (universidad, etc.)",
            help: "Nombre secundario o pertenencia institucional. Ej: 'Universidad de Buenos Aires'",
          },
          {
            name: "description",
            label: "Descripción institucional breve",
            help: "Breve descripción institucional que aparece debajo del nombre en el footer",
          },
        ],
      },
      {
        title: "Footer Column Links",
        description: "Footer column with a heading and list of links",
        fields: [
          {
            name: "heading",
            label: "Título de la columna",
            help: "Título de la columna de enlaces en el footer. Ej: 'Navegación', 'Servicios', 'Información'",
          },
        ],
      },
      {
        title: "Footer Column Text",
        description: "Footer column with free text content",
        fields: [
          {
            name: "heading",
            label: "Título de la columna",
            help: "Título de la columna de texto libre en el footer",
          },
          {
            name: "body",
            label: "Contenido de la columna",
            help: "Contenido de texto libre para esta columna del footer. Útil para notas legales, copyright u otra información institucional",
          },
        ],
      },
    ],
  },
  {
    title: "Personal",
    entries: [
      {
        title: "CV Item",
        description: "Entrada de formación académica o experiencia profesional",
        fields: [
          {
            name: "tipo",
            label: "Tipo de entrada del CV",
            help: "Categoría del ítem del CV. 'academico': títulos, posgrados, cursos · 'profesional': cargos, experiencia laboral",
            values: [
              "academico",
              "profesional",
            ],
          },
          {
            name: "titulo",
            label: "Título o nombre del cargo",
            help: "Nombre del título, cargo o logro. Ej: 'Doctor en Odontología', 'Jefe de Trabajos Prácticos'",
          },
          {
            name: "institucion",
            label: "Institución",
            help: "Institución donde se obtuvo el título o donde se desempeñó el cargo. Ej: 'UBA', 'Hospital Alemán'",
          },
        ],
      },
      {
        title: "Contacto",
        description: "Información de contacto opcional de un miembro del staff",
        fields: [
          {
            name: "telefono",
            label: "Teléfono de contacto",
            help: "Número de teléfono o interno del docente. Ej: '+54 11 4372-0000 int. 123'",
          },
          {
            name: "horario",
            label: "Horario de atención",
            help: "Horarios de atención o disponibilidad. Ej: 'Lunes y Miércoles de 10 a 12 hs'",
          },
          {
            name: "ubicacion",
            label: "Oficina o ubicación",
            help: "Oficina o lugar físico donde se puede encontrar al miembro. Ej: 'Oficina 3B, 2do piso'",
          },
          {
            name: "descripcion",
            label: "Observaciones de contacto (opcional)",
            help: "Información adicional de contacto u observaciones. Ej: 'Consultas solo por email', 'Atención con turno previo'",
          },
        ],
      },
    ],
  },
  {
    title: "Navegación móvil",
    entries: [
      {
        title: "Barra de navegación móvil",
        description: "Configuración general de la barra de navegación móvil (hasta 3 accesos directos entre Inicio y Menú)",
        fields: [
          {
            name: "title",
            label: "Título interno",
            help: "Nombre con el que aparece este registro en el panel de administración. No se muestra en el sitio — dejalo como está",
          },
        ],
      },
      {
        title: "Mobile Nav Item",
        description: "Acceso directo de la barra de navegación móvil",
        fields: [
          {
            name: "label",
            label: "Etiqueta del acceso",
            help: "Texto corto que aparece bajo el ícono en la barra móvil. Una palabra idealmente. Ej: 'Revista', 'Admisión', 'Noticias'",
          },
          {
            name: "external_url",
            label: "URL externa",
            help: "URL externa de destino (https://...). Usá este campo O la ruta interna, no ambos. Si ambos están definidos, gana la URL externa. El acceso se ignora si no tiene destino",
          },
        ],
      },
    ],
  },
  {
    title: "Tipos de contenido",
    entries: [
      {
        title: "Article",
        description: "",
        fields: [
          {
            name: "Title",
            label: "Título del artículo",
            help: "Título del artículo o noticia. Aparece como encabezado principal y se usa para generar el slug automáticamente",
          },
          {
            name: "excerpt",
            label: "Resumen breve (para listados)",
            help: "Resumen breve del artículo. Se muestra en las tarjetas de listado y en el preview. Máximo 2-3 oraciones",
          },
        ],
      },
      {
        title: "Block Group",
        description: "Grupo reutilizable de blocks SDUI usado dentro de blocks.section.",
        fields: [
          {
            name: "name",
            label: "Nombre interno (solo admin)",
            help: "Nombre interno del grupo de bloques. Solo visible en el admin — usalo para identificarlo fácilmente. Ej: 'Columna izquierda home', 'Sidebar contacto'",
          },
          {
            name: "group_columns",
            label: "Columnas de la grilla (1–12)",
            help: "Columnas de la grilla CSS para este grupo (1–12). Controla el ancho dentro de la sección contenedora. Valor por defecto: 12 (ancho completo)",
          },
        ],
      },
      {
        title: "Form",
        description: "Formularios dinámicos definidos por editores.",
        fields: [
          {
            name: "title",
            label: "Ej: Formulario de contacto, Inscripción al programa",
            help: "Nombre interno del formulario. Solo visible en el panel de administración",
          },
          {
            name: "submit_label",
            label: "Dejar vacío para usar 'Enviar' por defecto",
            help: "Texto que aparece en el botón de envío del formulario",
          },
          {
            name: "email_to",
            label: "Notificaciones por correo — próximamente",
            help: "Correo electrónico que recibirá una notificación por cada envío (funcionalidad disponible en fase 2)",
          },
        ],
      },
      {
        title: "Form Submission",
        description: "Envíos de formularios dinámicos.",
        fields: [
          {
            name: "form_id",
            label: "ID del formulario de origen",
            help: "Identificador único del formulario que generó este envío. Se asigna automáticamente",
          },
          {
            name: "form_title",
            label: "Nombre del formulario",
            help: "Nombre del formulario al momento del envío. Se copia automáticamente",
          },
          {
            name: "ip_address",
            label: "IP del remitente (solo lectura)",
            help: "Dirección IP del usuario que realizó el envío. Útil para detectar spam o envíos duplicados",
          },
        ],
      },
      {
        title: "Page",
        description: "Contenido estructural de una ruta.",
        fields: [
          {
            name: "title",
            label: "Nombre de la página",
            help: "Nombre interno de la página. Se usa como referencia en el admin y como título SEO si no hay otro configurado",
          },
          {
            name: "layout",
            label: "Diseño de la página",
            help: "Diseño de la página. 'default': ancho contenido estándar con márgenes · 'full-width': ocupa todo el ancho de la pantalla",
            values: [
              "default",
              "full-width",
            ],
          },
        ],
      },
      {
        title: "Route",
        description: "Defines the available routes/paths for the Next.js frontend.",
        fields: [
          {
            name: "label",
            label: "Etiqueta del menú",
            help: "Nombre visible de la ruta en el menú de navegación. Ej: 'Inicio', 'Acerca de', 'Carreras'",
          },
          {
            name: "type",
            label: "Tipo de ruta",
            help: "Tipo de ruta. 'page': página con contenido · 'section': agrupa sub-rutas sin página propia · 'header': ítem del encabezado de navegación",
            values: [
              "page",
              "section",
              "header",
            ],
          },
          {
            name: "order",
            label: "Orden en el menú",
            help: "Posición de esta ruta en el menú. Números menores aparecen primero. Ej: 1 = primer ítem, 2 = segundo",
          },
          {
            name: "visibility",
            label: "Visibilidad",
            help: "Quién puede ver esta ruta. 'public': cualquier visitante · 'requires-login': solo usuarios con sesión iniciada (cuenta @ues.edu.sv). Las rutas ocultas no aparecen en el menú",
            values: [
              "public",
              "requires-login",
            ],
          },
          {
            name: "allowed_roles",
            label: "Roles permitidos",
            help: "Restringe la ruta a ciertos roles de usuario (Estudiante, Catedrático…). Vacío = sin restricción por rol (manda la Visibilidad). Con roles seleccionados, la ruta exige sesión iniciada Y que el rol del usuario esté en la lista; para el resto no aparece en el menú. Ojo: el rol se lee al iniciar sesión — tras cambiar el rol de un usuario, pedile que cierre sesión y vuelva a entrar",
          },
        ],
      },
      {
        title: "Staff",
        description: "Miembros del cuerpo docente y administrativo de la facultad",
        fields: [
          {
            name: "nombre",
            label: "Nombre completo",
            help: "Nombre completo del miembro. Ej: 'Dr. Juan García', 'Lic. María Rodríguez'",
          },
          {
            name: "cargo",
            label: "Cargo en la institución",
            help: "Cargo o función que ocupa dentro de la institución. Ej: 'Decano', 'Profesor Titular', 'Coordinador Académico'",
          },
          {
            name: "descripcion",
            label: "Biografía breve (opcional)",
            help: "Breve biografía o descripción profesional del miembro. Se muestra en su perfil público",
          },
        ],
      },
      {
        title: "Unidad Organizacional",
        description: "Comités, decanato, junta directiva y unidades administrativas",
        fields: [
          {
            name: "nombre",
            label: "Nombre de la unidad",
            help: "Nombre oficial de la unidad organizacional. Ej: 'Decanato', 'Comité de Ética', 'Unidad de Admisiones'",
          },
          {
            name: "tipo",
            label: "Tipo de unidad",
            help: "Categoría de la unidad. 'decanato': máxima autoridad · 'vicedecanato': vice-autoridad · 'junta_directiva': órgano colegiado · 'comite_tecnico': comité especializado · 'unidad_administrativa': área de gestión",
            values: [
              "decanato",
              "vicedecanato",
              "junta_directiva",
              "comite_tecnico",
              "unidad_administrativa",
            ],
          },
          {
            name: "descripcion",
            label: "Descripción y funciones (opcional)",
            help: "Descripción de las funciones y responsabilidades de esta unidad. Se muestra en la página de la unidad si corresponde",
          },
        ],
      },
    ],
  },
];
