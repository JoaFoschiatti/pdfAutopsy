# Guia breve de estudio forense

## Preguntas que ordenan el trabajo pericial

Una pericia no empieza con una herramienta. Empieza con preguntas. Las preguntas pueden venir formuladas como puntos de pericia, hipotesis de investigacion, requerimientos legales o necesidades de una organizacion. Algunas son descriptivas: que archivos existen, que usuarios fueron creados, que eventos aparecen en un rango horario. Otras son reconstructivas: cuando se conecto un dispositivo USB, desde que cuenta se envio un correo, que actividad precedio a la eliminacion de archivos.

> La atribucion exige cautela. Que un evento haya sido registrado bajo una cuenta de usuario no significa automaticamente que la persona titular de esa cuenta haya ejecutado la accion.

La observacion tecnica puede decir que el sistema registro una sesion a las `09:42`. La conclusion no deberia ser, sin mas evidencia, que una persona especifica uso el equipo a esa hora.

## Evidencia y cadena de custodia

La evidencia digital rara vez prueba por si sola una intencion humana. Normalmente prueba estados, eventos, relaciones temporales o rastros de actividad. La intencion, la autoria personal y el dolo suelen requerir integracion con otras pruebas.

| Elemento | Riesgo | Control |
| --- | --- | --- |
| Imagen forense | Alteracion accidental | Hash inicial y final |
| Registro de eventos | Reloj incorrecto | Comparacion con fuentes externas |
| Cuenta de usuario | Uso compartido | Correlacion con accesos fisicos |

La integridad puede modelarse como una igualdad entre huellas:

$$
hash_{origen} = hash_{copia}
$$

Cuando esa igualdad se rompe, el informe debe explicar el alcance del desvio y si afecta o no a las conclusiones.

## Lectura critica de logs

Los logs no son narraciones completas. Son muestras parciales producidas por sistemas con configuraciones concretas. Un evento ausente puede significar que algo no ocurrio, que no fue registrado, que fue rotado o que la fuente no estaba disponible.

```txt
2026-05-20T09:42:11Z usb.attach device="Kingston DataTraveler"
2026-05-20T09:43:02Z file.copy source="/caso/informe.docx" target="/media/usb/informe.docx"
2026-05-20T09:45:18Z usb.detach device="Kingston DataTraveler"
```

En un informe, una frase como **"se observo una copia de archivo hacia USB"** es mas precisa que afirmar autoria directa sin corroboracion. Tambien es util separar hechos, inferencias y limitaciones.

## Terminos recurrentes

Un concepto puede aparecer varias veces: cadena de custodia, hash, metadatos, artefacto, linea de tiempo. mdAutopsy permite marcar un termino una vez y volver a verlo resaltado cuando reaparece en el documento.

La seleccion puede cruzar contenido inline como **texto destacado**, `codigo en linea` o [referencias externas](https://example.com) siempre que pertenezca al mismo bloque semantico.

## Formula de prioridad

Cuando un termino coincide con una zona resaltada, el termino debe tener prioridad visual. La regla practica es:

$$
prioridad(termino) > prioridad(resaltado)
$$

Asi el color del concepto comunica la categoria de estudio sin competir con el resaltado general.

<script>alert("este HTML no debe ejecutarse")</script>
