// Variante para cuando tengas la Lambda Function URL en vivo.
// Cambia TU-URL por la URL real (sin /readings al final; se añade aquí).

let
    Url = "https://TU-URL.lambda-url.us-west-1.on.aws/readings",
    Origen = Json.Document(
        Web.Contents(
            Url,
            [Query = [limit = "2000"]]
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
