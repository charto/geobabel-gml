import * as stream from 'stream';

import * as cxml from 'cxml';
import * as geo from 'geobabel';

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

function convertDimension(coordList: number[], src: number, dst: number) {
	const result: number[] = [];

	if(src > dst) {
		const count = coordList.length;

		for(let num = 0; num < count; ++num) {
			if(num % src < dst) result.push(coordList[num]);
		}
	} else {
		// TODO
	}

	return(result);
}

export class Parser<WrapperToken extends cxml.Token> {

	constructor(
		public Wrapper: { new(geometry: geo.Geometry): WrapperToken },
		config?: cxml.ParserConfig
	) {
		if(!config) {
			config = new cxml.ParserConfig({ parseUnknown: true });
			config.bindNamespace(cxml.processing);
			config.bindNamespace(cxml.anonymous);
			config.bindNamespace(cxml.xml1998);
			config.addNamespace(new cxml.Namespace('gml', 'http://www.opengis.net/gml'));
		}

		this.registry = config.registerTokens(tokenTbl);
		this.config = config;
	}

	createStream() {
		return(new ParserStream(this.Wrapper, this.registry));
	}

	registry: cxml.Registry;
	config: cxml.ParserConfig;
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

		const gml_srsName = tokens['gml:srsName'].id!;
		const gml_srsDimension = tokens['gml:srsDimension'].id!;

		let token = chunk[0];

		let depth = this.depth;
		let captureDepth = this.captureDepth;
		let dimension = this.dimension;
		let isPos = this.isPos;
		let isDimension = this.isDimension;
		let coordList = this.coordList;
		let ringList = this.ringList;

		let lastNum = chunk.length - 1;
		let tokenNum = -1;

		if(token instanceof cxml.RecycleToken) {
			lastNum = token.lastNum;
			++tokenNum;
		}

		while(tokenNum < lastNum) {

			token = chunk[++tokenNum];

			if(token instanceof cxml.MemberToken) {
				if(token.kind == cxml.TokenKind.open) {
					++depth;
					if(depth < captureDepth && this.captureTbl[token.id!]) captureDepth = depth;
				}

				if(token.kind == cxml.TokenKind.string) {
					if(token.id == gml_srsDimension) isDimension = true;
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
								if(dimension != 2) coordList = convertDimension(coordList, dimension, 2);
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
								if(dimension != 2) coordList = convertDimension(coordList, dimension, 2);
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

							if(token.kind == cxml.TokenKind.open) {
								dimension = 2;
							} if(token.kind == cxml.TokenKind.emitted) {
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

				continue;
			}

			if(typeof(token) == 'string') {
				if(isPos && coordList) {
					coordList.push.apply(coordList, token.split(' ').map((num: string) => +num));
					continue;
				}

				if(isDimension) {
					dimension = +token;
					isDimension = false;
					continue;
				}
			}

			if(depth < captureDepth) {
				output.push(token);
			}
		}

		flush(null, output);

		this.depth = depth;
		this.captureDepth = captureDepth;
		this.dimension = dimension;
		this.isPos = isPos;
		this.isDimension = isDimension;
		this.coordList = coordList;
		this.ringList = ringList;
	}

	depth = 0;
	captureDepth = Infinity;
	captureTbl: (boolean | undefined)[] = []

	dimension = 2;

	isPos = false;
	isDimension = false;
	coordList: number[] | undefined;
	ringList: (number[] | null)[] | undefined;
}
