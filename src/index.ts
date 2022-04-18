import * as fs from "fs";

type TransformFunction = (expr: string) => string;
const identity = <T>(x: T) => x;

const compose = (f: TransformFunction, g: TransformFunction) => (expr: string) => g(f(expr));

const float = (x: number) => {
    const str = x.toString();
    if (str.indexOf(".") !== -1) return str;
    else return str + ".0";
}

type Property = "sdf" | "normal" | "color";

const PropertyTypes: {[type: string]: string} = {
    "sdf": "float",
    "normal": "vec3",
    "color": "vec3",
}

class Vec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;

    static Origin = new Vec3(0, 0, 0);

    constructor(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    compile(): string {
        return `vec3(${float(this.x)}, ${float(this.y)}, ${float(this.z)})`;
    }
}

class Material {
    color: Vec3;

    static Default = new Material(new Vec3(1, 1, 1));

    constructor(color: Vec3) {
        this.color = color;
    }

    compile(transformer: TransformFunction, property: Property): string {
        switch (property) {
            case "color": return this.color.compile();
            default: throw new InvalidPropertyException(Material, property);
        }
    }
}

class InvalidPropertyException {
    readonly property: Property;
    readonly object: Function;

    constructor(object: Function, property: Property) {
        this.property = property;
        this.object = object;
    }

    toString(): string {
        return `property ${this.property} not supported by ${this.object.name}`;
    }
}

interface Output {
    pushIndent(n: number): void;
    popIndent(n: number): void;
    write(line: string): void;
}

class ConsoleOutput implements Output {
    private indent: number = 0;

    pushIndent(n: number): void {
        this.indent += n;
    }

    popIndent(n: number): void {
        this.indent -= n;
    }

    write(line: string) {
        console.log("\t".repeat(this.indent) + line);
    }
}

abstract class Scene {
    protected static nextId: number = 0;
    protected id: number;

    constructor(reserveIds: number = 1) {
        Scene.nextId += reserveIds;
        this.id = Scene.nextId - 1;
    }

    identifier(property: Property): string {
        return `${property}${this.id}`;
    }

    protected writeProperty(output: Output, property: Property, expr: string) {
        output.write(`${PropertyTypes[property]} ${this.identifier(property)} = ${expr};`)
    }

    abstract compile(transformer: TransformFunction, output: Output, property: Property): void;
}

abstract class Transform extends Scene {
    scene: Scene;

    constructor(scene: Scene) {
        super(0);
        this.scene = scene;
    }

    override identifier(property: Property): string {
        return this.scene.identifier(property);
    }

    override compile(transformer: TransformFunction, output: Output, property: Property): void {
        this.scene.compile(compose(this.transformer(), transformer), output, property);
    }

    abstract transformer(): TransformFunction;
}

class Translate extends Transform {
    translate: Vec3;

    constructor(translate: Vec3, scene: Scene)  {
        super(scene);
        this.translate = translate;
    }

    override transformer(): TransformFunction {
        return expr => `(${expr} + ${this.translate.compile()})`;
    }
}

abstract class Shape extends Scene {
    material: Material = Material.Default;

    constructor(material?: Material) {
        super();
        if (material) {
            this.material = material;
        }
    }

    override compile(transformer: TransformFunction, output: Output, property: Property): void {
        if (property === "sdf") {
            this.writeProperty(output, "sdf", this.sdf(transformer));
        }
        else if (property === "normal") {
            this.writeProperty(output, "normal", this.normal(transformer));
        }
        else {
            this.writeProperty(output, property, this.material.compile(transformer, property));
        }
    }

    protected abstract sdf(transformer: TransformFunction): string;
    protected abstract normal(transformer: TransformFunction): string;
}

abstract class Operator extends Scene {
    readonly scenes: Scene[];

    constructor(scenes: Scene[], reserveIds: number = 1) {
        super(reserveIds);
        this.scenes = scenes;
    }

    abstract override compile(transformer: TransformFunction, output: Output, property: Property): void;
}

abstract class BinaryOperator extends Operator {
    constructor(scenes: Scene[]) {
        // Reserve additional identifiers for intermediate values.
        super(scenes, scenes.length);
    }

    override compile(transformer: TransformFunction, output: Output, property: Property): void {
        for (let scene of this.scenes) {
            scene.compile(transformer, output, property);
        }

        let lastIdentifier = (property: Property) => this.scenes[0].identifier(property);
        for (let i=1; i<this.scenes.length; ++i) {
            let id = this.id - this.scenes.length + i;
            output.write(`${PropertyTypes[property]} ${property}${id} = ${
                this.compileBinary(lastIdentifier, this.scenes[i], transformer, property)
            };`);
            lastIdentifier = property => `${property}${id}`;
        }

        this.writeProperty(output, property, lastIdentifier(property));
    }

    protected abstract compileBinary(identifier: (property: Property) => string, scene: Scene, transformer: TransformFunction, property: Property): string;
}

class Sphere extends Shape {
    radius: number;

    constructor(radius: number, material?: Material) {
        super(material);
        this.radius = radius;
    }

    protected override sdf(transformer: TransformFunction): string {
        return `length(point - ${transformer(Vec3.Origin.compile())}) - ${this.radius}`;
    }

    protected override normal(transformer: TransformFunction): string {
        return `normalize(point - ${transformer(Vec3.Origin.compile())})`;
    }
}

class Plane extends Shape {
    #normal: Vec3;

    constructor(normal: Vec3, material?: Material) {
        super(material);
        this.#normal = normal;
    }

    protected override sdf(transformer: TransformFunction): string {
        return `abs(dot(${this.#normal.compile()}, point - ${transformer(Vec3.Origin.compile())}))`;
    }

    protected override normal(transformer: TransformFunction): string {
        return this.#normal.compile();
    }
}

class Union extends BinaryOperator {
    smoothing: number;

    constructor(smoothing: number, scenes: Scene[]) {
        super(scenes);
        this.smoothing = smoothing;
    }

    protected override compileBinary(identifier: (property: Property) => string, shape: Shape, transformer: TransformFunction, property: Property): string {
        switch (property) {
            case "sdf":
                return `smin(${identifier(property)}, ${shape.identifier(property)}, ${float(this.smoothing)})`;
            case "normal":
            case "color":
                return `blend3(${identifier(property)}, ${shape.identifier(property)}, ${identifier("sdf")}, ${shape.identifier("sdf")}, ${float(this.smoothing)})`;
        }
    }
}

class Compiler {
    private loadTemplate(): string[] {
        return fs.readFileSync("src/glsl/main.frag", 'utf-8').split("\n");
    }

    private checkTemplateString(line: string): [string | null, number] {
        const match = line.match(/^(\t*)#evaluate\s+<(\w+)>\s*$/);
        if (match) {
            return [match[2], match[1].length];
        }
        else {
            return [null, 0];
        }
    }

    private replace(output: Output, templateString: string, scene: Scene) {
        try {
            if (templateString in PropertyTypes) {
                const property = templateString as Property;
                scene.compile(identity, output, property);
                output.write(`${PropertyTypes[property]} ${property} = ${scene.identifier(property)};`)
            }
            else {
                output.write(`/* unknown property: ${templateString} */`);
            }
        }
        catch (e) {
            output.write(`/* error: ${e.toString()} */`);
        }
    }

    private processTemplateLine(output: Output, line: string, scene: Scene) {
        const [templateString, indent] = this.checkTemplateString(line);
        
        if (templateString) {
            output.pushIndent(indent);
            this.replace(output, templateString, scene);
            output.popIndent(indent);
        }
        else {
            output.write(line);
        }
    }

    compile(output: Output, scene: Scene) {
        const template = this.loadTemplate();
        for (const line of template) {
            this.processTemplateLine(output, line, scene);
        }
    }
}

function main() {
    const scene = (
        new Union(0.1,
            [
                new Translate(
                    new Vec3(0, 0, 1),
                    new Union(0.2,
                        [
                            new Sphere(0.2),
                            new Translate(
                                new Vec3(0.4, 0.2, 0.0),
                                new Sphere(0.5),
                            ),
                            new Translate(
                                new Vec3(-0.1, 0.3, 0.0),
                                new Sphere(0.1, new Material(new Vec3(1, 0, 0))),
                            ),
                        ]
                    )
                ),
                new Translate(
                    new Vec3(0, -0.2, 0),
                    new Plane(new Vec3(0, 1, 0)),
                ),
            ]
        )
    );

    const compiler = new Compiler();
    const output = new ConsoleOutput();

    compiler.compile(output, scene);
}

main();
