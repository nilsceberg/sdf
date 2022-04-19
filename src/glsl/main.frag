#define SHADERTOY

// Misc
const float EPSILON = 0.00001;

// Raymarching
const float STEP_SIZE = 0.001;
const float MAX_RANGE = 10.0;

// Raytracing
const float LIGHT_RAYS = 6.0;
const int JUMPS = 1;

// Lighting
const float AMBIENT = 0.3;

#define PI 3.1415926538

// All components are in the range [0…1], including hue.
vec3 hsv2rgb(vec3 c)
{
	vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
	vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
	return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 rgb2hsv(vec3 c)
{
	vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
	vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
	vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

	float d = q.x - min(q.w, q.y);
	float e = 1.0e-10;
	return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// Attribution: https://github.com/glslify/glsl-smooth-min/blob/master/poly.glsl
float smin(float a, float b, float k) {
	float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
	return mix(b, a, h) - k * h * (1.0 - h);
}

float smax(float a, float b, float k) {
	return -smin(-a, -b, k);
}

float blend(float a, float b, float sdfa, float sdfb, float sdf, float k) {
	float da = abs(sdfa - sdf);
	float db = abs(sdfb - sdf);
	float t = da / (da + db);
	return mix(a, b, t);
}

vec3 blend3(vec3 a, vec3 b, float sdfa, float sdfb, float sdf, float k) {
	float da = abs(sdfa - sdf);
	float db = abs(sdfb - sdf);
	float t = da / (da + db);
	return mix(a, b, t);
}

vec3 sun() {
#ifdef SHADERTOY
	return 3.0 * vec3(cos(iTime), 1.0, sin(iTime));
#else
	//return vec3(3.0, 3.0, 1.0);
	return normalize(vec3(3.0, 3.0, 1.0));
#endif
}

vec3 diffuse(vec3 position, vec3 normal, vec3 color) {
	return color * (dot(normalize(sun() - position), normal) + 1.0) / 2.0;
}

vec3 edgeGlowAccumulation(float sdf, float edge, vec3 color) {
	if (sdf > 0.01) {
		return edge * color * 0.05 / (sdf * sdf);
	}
	else {
		return vec3(0.0);
	}
}

vec3 valueMix(vec3 a, vec3 b) {
	float x = rgb2hsv(a).z;
	float y = rgb2hsv(b).z;
	return mix(a, b, y / (x+y));
}

// (x,y,z,min(sdf))
vec4 raymarch(vec3 from, vec3 to, float sdfBias, inout float range) {
	vec3 point = from;
	vec3 ray = normalize(to - from);
	vec3 finalColor = vec3(0.0);
	float minSdf = 100000.0;
	
	while (range > STEP_SIZE) {
		float remaining = length(to - point);
		#evaluate <sdf>
		sdf += sdfBias;
		minSdf = min(minSdf, sdf);

		if (remaining < sdf) {
			point = to;
			range = 0.0;
			break;
		}
		else if (sdf <= remaining && sdf < STEP_SIZE) {
			break;
		}
		
		// Optimization: Use SDF as step size.
		point += ray * sdf;
		range -= sdf;
	}

	return vec4(point, minSdf);
}

vec3 raytrace(vec3 ray) {
	int jumps = JUMPS;
	float range = MAX_RANGE;
	float bias = 0.0;
	float combinedReflectivity = 1.0;
	vec3 finalColor = vec3(0.0);
	vec3 point = vec3(0.0);

	while (range > STEP_SIZE && combinedReflectivity > 0.0) {
		vec3 stop = ray * range;
		vec4 result = raymarch(point, stop, bias, range);
		point = result.xyz;
		float closest = result.w;
		
		if (range <= STEP_SIZE) {
			// Hit nothing.
			break;
		}
		else {
			// Yes, evaluating the SDF again is sometimes redundant, but makes for nicer code.
			#evaluate <sdf>
			#evaluate <normal>
			#evaluate <color>

			// Normal visualization:
			//return (normal + vec3(1.0)) * 0.5;

			//vec3 pointAboveSurface = point + normal * (STEP_SIZE * 2.0);
			vec3 pointAboveSurface = point;

			// Cast ray toward light source to see if we are reached by it.
			// Add a small margin to the SDF so that we are outside the shape
			// we're tracing from.
			float illumination = 0.0; // ambient
			float maxIllumination = 0.0;

			vec3 light = sun();
			vec3 lightDir = light - point;
			float lightSize = 0.05;

			vec3 lightX = normalize(cross(lightDir, vec3(0.0, 1.0, 0.0)));
			vec3 lightY = normalize(cross(lightX, lightDir));

			// For subsequent rays, apply a small bias to make sure the start of the ray is outside the shape:
			bias += (STEP_SIZE - sdf) + EPSILON;

			// TODO: use the glow effect for soft shadows/ambient occlusion, maybe?
			// Cast rays to edges of light for softer shadows.
			// Requires many rays for pretty results. :(
			if (LIGHT_RAYS > 0.0) {
				for (float i = 0.0; i<LIGHT_RAYS; i += 1.0) {
					float a = 2.0*PI/(LIGHT_RAYS) * i;
					vec3 light = light + lightSize * (cos(a) * lightX + sin(a) * lightY);
					// Special range just for sun
					float range = 10.0;
					if (length(light - raymarch(pointAboveSurface, light, bias, range).xyz) < EPSILON) {
						illumination += 1.0 / LIGHT_RAYS;
					} 
				}
			}
			else {
				illumination = 1.0;
			}

			color *= illumination * (1.0 - AMBIENT) + AMBIENT;
			finalColor = valueMix(finalColor, diffuse(point, normal, color) * combinedReflectivity);

			if (jumps-- >= 0) {
				// Reflect!
				#evaluate <reflectivity>
				combinedReflectivity *= reflectivity * mix(0.2, 1.0, 1.0 - dot(-normal, ray));
				ray = reflect(ray, normal);
				//return (ray + vec3(1.0)) / 2.0;
			}
			else {
				break;
			}
		}
	}

	return finalColor;
}


vec4 render(vec2 screenSpace) {
	float range = MAX_RANGE;
	vec3 color = raytrace(normalize(vec3(screenSpace, 1.0)));
	return vec4(color, 1.0);
}

#ifdef SHADERTOY
void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
	// Normalized pixel coordinates (from -1 to 1 on y with x adjusted for aspect ratio)
	float aspect = iResolution.x / iResolution.y;
	vec2 xy = fragCoord/iResolution.xy * 2.0 - 1.0;
	xy.x *= aspect;
	
	fragColor = render(xy);
}
#endif