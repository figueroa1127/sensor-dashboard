// Power Query (M) para Power BI Desktop.
// Fuente: data.json publicado por GitHub Pages.
// En Power BI: Inicio -> Obtener datos -> Consulta en blanco -> Editor avanzado -> pega esto.

let
    Url = "http://localhost:4321/data.json",
    Origen = Json.Document(
        Web.Contents(
            Url,
            [Query = [t = DateTime.ToText(DateTime.LocalNow(), "yyyyMMddHHmmss")]]
        )
    ),
    Filas = Origen[rows],
    Tabla = Table.FromList(Filas, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    Expandida = Table.ExpandRecordColumn(
        Tabla,
        "Column1",
        {"sensor", "fecha", "frontal", "izquierda", "derecha", "obstaculo", "direccion", "girando"},
        {"sensor", "fecha", "frontal", "izquierda", "derecha", "obstaculo", "direccion", "girando"}
    ),
    ConFecha = Table.TransformColumnTypes(
        Expandida,
        {
            {"sensor", type text},
            {"fecha", type datetime},
            {"frontal", type number},
            {"izquierda", type number},
            {"derecha", type number},
            {"obstaculo", type number},
            {"direccion", type text},
            {"girando", type logical}
        }
    ),
    Ordenada = Table.Sort(ConFecha, {{"fecha", Order.Ascending}})
in
    Ordenada
