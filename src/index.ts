import * as stream from 'stream';

import * as cxml from 'cxml';
import * as geo from 'geobabel';

declare module 'geobabel/dist/geometry/Geometry' {

	interface Geometry {
		writeGML(config: cxml.ParserConfig, output?: cxml.TokenBuffer): cxml.TokenBuffer;
	}

}

declare module 'geobabel/dist/geometry/GeometryCollection' {

	interface GeometryCollection {
		multiName: string;
		membersName: string;
	}

}

const tokenTbl: cxml.TokenTbl = {
	gml: {
		uri: 'http://www.opengis.net/gml',
		elements: [
			'Point',
			'LineString',
			'Polygon',

			'MultiGeometry',
			'MultiPoint',
			'MultiLineString',
			'MultiPolygon',
			'MultiCurve',
			'MultiSurface',

			'geometryMembers',
			'pointMembers',
			'lineStringMembers',
			'polygonMembers',
			'curveMembers',
			'surfaceMembers',

			'exterior',
			'interior',
			'LinearRing',

			'pos',
			'posList'
		],
		attributes: [
			'srsDimension',
			'srsName'
		]
	}
};

geo.Point.prototype.writeGML = function(
	this: geo.Point,
	config: cxml.ParserConfig,
	output: cxml.TokenBuffer = []
) {
	const tokens = config.registry.tokens;
	const gml_Point = tokens['gml:Point'] as cxml.OpenToken;
	const gml_pos = tokens['gml:pos'] as cxml.OpenToken;

	output.push(
		gml_Point,
		gml_Point.emitted,
		gml_pos,
		gml_pos.emitted,
		this.pos.join(' '),
		gml_pos.close,
		gml_Point.close
	);

	return(output);
}

geo.LineString.prototype.writeGML = function(
	this: geo.LineString,
	config: cxml.ParserConfig,
	output: cxml.TokenBuffer = []
) {
	const tokens = config.registry.tokens;
	const gml_LineString = tokens['gml:LineString'] as cxml.OpenToken;
	const gml_posList = tokens['gml:posList'] as cxml.OpenToken;

	output.push(
		gml_LineString,
		gml_LineString.emitted,
		gml_posList,
		gml_posList.emitted,
		geo.writePosListWKT(this.posList),
		gml_posList.close,
		gml_LineString.close
	);

	return(output);
}

geo.Polygon.prototype.writeGML = function(
	this: geo.Polygon,
	config: cxml.ParserConfig,
	output: cxml.TokenBuffer = []
) {
	const tokens = config.registry.tokens;
	const gml_Polygon = tokens['gml:Polygon'] as cxml.OpenToken;
	const gml_LinearRing = tokens['gml:LinearRing'] as cxml.OpenToken;
	const gml_posList = tokens['gml:posList'] as cxml.OpenToken;
	const gml_interior = tokens['gml:interior'] as cxml.OpenToken;
	let wrapper = tokens['gml:exterior'] as cxml.OpenToken;

	output.push(
		gml_Polygon,
		gml_Polygon.emitted,
	);

	const ringCount = this.ringList.length;
	let ring: number[] | null | undefined;

	for(let ringNum = 0; ringNum < ringCount; ++ringNum) {
		ring = this.ringList[ringNum];

		if(ring) {
			output.push(
				wrapper,
				wrapper.emitted,
				gml_LinearRing,
				gml_LinearRing.emitted,
				gml_posList,
				gml_posList.emitted,
				geo.writePosListWKT(ring),
				gml_posList.close,
				gml_LinearRing.close,
				wrapper.close,
			);
		}

		wrapper = gml_interior;
	}

	output.push(
		gml_Polygon.close
	);

	return(output);
}

geo.GeometryCollection.prototype.multiName = 'gml:MultiGeometry';
geo.GeometryCollection.prototype.membersName = 'gml:geometryMembers';

geo.MultiPoint.prototype.multiName = 'gml:MultiPoint';
geo.MultiPoint.prototype.membersName = 'gml:pointMembers';

geo.MultiLineString.prototype.multiName = 'gml:MultiLineString';
geo.MultiLineString.prototype.membersName = 'gml:lineStringMembers';

geo.MultiPolygon.prototype.multiName = 'gml:MultiPolygon';
geo.MultiPolygon.prototype.membersName = 'gml:polygonMembers';

geo.MultiCurve.prototype.multiName = 'gml:MultiCurve';
geo.MultiCurve.prototype.membersName = 'gml:curveMembers';

geo.MultiSurface.prototype.multiName = 'gml:MultiSurface';
geo.MultiSurface.prototype.membersName = 'gml:surfaceMembers';

geo.GeometryCollection.prototype.writeGML = function(
	this: geo.GeometryCollection,
	config: cxml.ParserConfig,
	output: cxml.TokenBuffer = []
) {
	const tokens = config.registry.tokens;
	const gml_Multi = tokens[this.multiName] as cxml.OpenToken;
	const gml_Members = tokens[this.membersName] as cxml.OpenToken;

	output.push(
		gml_Multi,
		gml_Multi.emitted,
		gml_Members,
		gml_Members.emitted,
	);

	for(let child of this.childList) {
		if(child.writeGML) child.writeGML(config, output);
	}

	output.push(
		gml_Members.close,
		gml_Multi.close
	);

	return(output);
}

export class GeometryToken extends cxml.Token {

	constructor(public geometry: geo.Geometry) { super(); }

	serialize(indent: string, config: cxml.ParserConfig): string | cxml.TokenBuffer {
		return(this.geometry.writeGML(config));
	}

}

export class Parser<WrapperToken extends cxml.Token> {

	constructor(
		public Wrapper: { new(geometry: geo.Geometry): WrapperToken },
		private config?: cxml.ParserConfig
	) {
		if(!config) {
			config = new cxml.ParserConfig({ parseUnknown: true });
			config.bindNamespace(cxml.processing);
			config.bindNamespace(cxml.anonymous);
			config.addNamespace(cxml.xml1998);
			config.addNamespace(new cxml.Namespace('gml', 'http://www.opengis.net/gml'));
		}

		this.registry = config.registerTokens(tokenTbl);
	}

	createStream() {
		return(new ParserStream(this.Wrapper, this.registry));
	}

	registry: cxml.Registry;
}

export class ParserStream<WrapperToken extends cxml.Token> extends stream.Transform {

	constructor(
		public Wrapper: { new(geometry: geo.Geometry): WrapperToken },
		private registry: cxml.Registry
	) {
		super({ objectMode: true });

		const tokens = this.registry.tokens;
		const gml_Point = tokens['gml:Point'].id!;
		const gml_LineString = tokens['gml:LineString'].id!;
		const gml_Polygon = tokens['gml:Polygon'].id!;
		const gml_interior = tokens['gml:interior'].id!;
		const gml_exterior = tokens['gml:exterior'].id!;
		const gml_LinearRing = tokens['gml:LinearRing'].id!;
		const gml_pos = tokens['gml:pos'].id!;
		const gml_posList = tokens['gml:posList'].id!;

		const captureTbl = this.captureTbl;
		captureTbl[gml_Point] = true;
		captureTbl[gml_LineString] = true;
		captureTbl[gml_Polygon] = true;
	}

	_transform(chunk: cxml.TokenBuffer | null, enc: string, flush: (err: any, chunk: cxml.TokenBuffer | null) => void) {
		if(!chunk) {
			flush(null, null);
			return;
		}

		const output: cxml.TokenBuffer = [];
		const tokens = this.registry.tokens;
		const gml_Point = tokens['gml:Point'].id!;
		const gml_LineString = tokens['gml:LineString'].id!;
		const gml_Polygon = tokens['gml:Polygon'].id!;
		const gml_interior = tokens['gml:interior'].id!;
		const gml_exterior = tokens['gml:exterior'].id!;
		const gml_LinearRing = tokens['gml:LinearRing'].id!;
		const gml_pos = tokens['gml:pos'].id!;
		const gml_posList = tokens['gml:posList'].id!;

		let token = chunk[0];

		let depth = this.depth;
		let captureDepth = this.captureDepth;
		let isPos = this.isPos;
		let coordList = this.coordList;
		let ringList = this.ringList;

		let lastNum = token instanceof cxml.RecycleToken ? token.lastNum : chunk.length - 1;
		let tokenNum = -1;

		while(tokenNum < lastNum) {

			token = chunk[++tokenNum];

			if(token instanceof cxml.MemberToken) {
				if(token.kind == cxml.TokenKind.open) {
					++depth;
					if(depth < captureDepth && this.captureTbl[token.id!]) captureDepth = depth;
				}

				if(token.kind == cxml.TokenKind.string) {
					if(depth < captureDepth) output.push(token);
				} else if(this.registry.elements[token.id!]) {
					switch(token.id) {
						case gml_Point:

							if(token.kind == cxml.TokenKind.open) {
								coordList = [];
							} else if(token.kind == cxml.TokenKind.close && coordList) {
								output.push(new this.Wrapper(new geo.Point(coordList[0], coordList[1])));
								coordList = void 0;
							}

							break;

						case gml_LineString:

							if(token.kind == cxml.TokenKind.open) {
								coordList = [];
							} else if(token.kind == cxml.TokenKind.close && coordList) {
								output.push(new this.Wrapper(new geo.LineString(coordList)));
								coordList = void 0;
							}

							break;

						case gml_Polygon:

							if(token.kind == cxml.TokenKind.open) {
								ringList = [ null ];
							} else if(token.kind == cxml.TokenKind.close && ringList) {
								output.push(new this.Wrapper(new geo.Polygon(ringList)));
								ringList = void 0;
							}

							break;

						case gml_interior:
						case gml_exterior:

							if(token.kind == cxml.TokenKind.close && ringList && coordList) {
								if(token.id == gml_interior) {
									ringList.push(coordList);
								} else {
									// GML allows up to one exterior ring.
									ringList[0] = coordList;
								}

								coordList = void 0;
							}

							break;

						case gml_LinearRing:

							if(token.kind == cxml.TokenKind.open) {
								coordList = [];
							}

							break;

						case gml_pos:
						case gml_posList:

							if(token.kind == cxml.TokenKind.emitted) {
								isPos = true;
							} else if(token.kind == cxml.TokenKind.close) {
								isPos = false;
							}

							break;

						default:

							if(depth < captureDepth) output.push(token);

					}
				} else if(depth < captureDepth) output.push(token);

				if(token.kind == cxml.TokenKind.close) {
					--depth;
					if(depth < captureDepth) captureDepth = Infinity;
				}
			} else {
				if(typeof(token) == 'string' && isPos && coordList) {
					coordList.push.apply(coordList, token.split(' ').map((num: string) => +num))
				} else if(depth < captureDepth) {
					output.push(token);
				}
			}
		}

		flush(null, output);

		this.depth = depth;
		this.captureDepth = captureDepth;
		this.isPos = isPos;
		this.coordList = coordList;
		this.ringList = ringList;
	}

	depth = 0;
	captureDepth = Infinity;
	captureTbl: (boolean | undefined)[] = []

	isPos = false;
	coordList: number[] | undefined;
	ringList: (number[] | null)[] | undefined;
}
